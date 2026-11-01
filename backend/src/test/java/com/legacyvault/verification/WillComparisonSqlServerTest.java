package com.legacyvault.verification;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.RecordWillComparisonRequest;
import com.legacyvault.verification.dto.RecordWillComparisonRequest.Result;
import com.legacyvault.verification.service.WillComparisonService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** PS-139: one immutable conclusion per paper will, proved on real SQL Server (locks, races, rollback). */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class WillComparisonSqlServerTest extends LegalBasisSqlServerSupport {

    private record Data(Fixture f, UUID will, List<UUID> intakes, CustomUserPrincipal secondLegal) {}

    private static WillComparisonService service() {
        return context.getBean(WillComparisonService.class);
    }

    private static Data data(int intakes) {
        Fixture f = fixture(false);
        jdbc.update("UPDATE dbo.vaults SET status='DOCUMENT_VERIFICATION' WHERE vault_id=?", f.vaultId());
        UUID will = UUID.randomUUID();
        long asset = jdbc.queryForObject("INSERT dbo.assets (public_id, vault_id, asset_type, title) OUTPUT inserted.asset_id VALUES (?, ?, 'DOCUMENT', 'Digital will')", Long.class, will.toString(), f.vaultId());
        jdbc.update("INSERT dbo.legal_documents (asset_id, document_type) VALUES (?, 'WILL')", asset);
        version(asset, 1, f.userId());
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < intakes; i++) {
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT dbo.original_will_intakes (public_id, verification_case_id, delivered_by_name, received_by_user_id) VALUES (?, ?, 'Fixture', ?)", id.toString(), f.caseId(), f.userId());
            ids.add(id);
        }
        UUID second = UUID.randomUUID();
        long secondId = jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) OUTPUT inserted.user_id VALUES (?, 'Second legal', ?, 'unused', 'ACTIVE')", Long.class, second.toString(), second + "@example.test");
        return new Data(f, will, ids, new CustomUserPrincipal(secondId, second, second + "@example.test"));
    }

    private static void version(long asset, int no, long user) {
        jdbc.update("INSERT dbo.asset_versions (asset_id, version_no, original_file_name, content_type, file_size_bytes, sha256_hash, encrypted_file_content, encryption_iv, encryption_key_version, uploaded_by_user_id) VALUES (?, ?, 'will.pdf', 'application/pdf', 1, ?, 0x01, 0x000000000000000000000000, 'test', ?)", asset, no, String.valueOf(no).repeat(64), user);
    }

    private static RecordWillComparisonRequest request(Data d, int intake, Result result) {
        return new RecordWillComparisonRequest(d.intakes().get(intake), d.will(), 1, result,
                result == Result.MATCH ? null : "reason");
    }

    private static int comparisons(Data d) {
        return count("will_comparisons", "verification_case_id=?", d.f().caseId());
    }

    private static int notifications(Data d) {
        return count("workflow_notifications", "case_id=? AND action='WILL_COMPARISON_RECORDED'", d.f().caseId());
    }

    private static int audits(Data d) {
        return count("audit_logs", "action='WILL_COMPARISON_RECORDED' AND vault_id=?", d.f().vaultId());
    }

    private static ErrorCode code(Throwable t) {
        assertThat(t).isInstanceOf(BusinessException.class);
        return ((BusinessException) t).getErrorCode();
    }

    /** AC 1, 2 */
    @Test
    void firstConclusionSucceedsAndSecondOnSamePaperIsRejectedWithoutChange() {
        Data d = data(1);
        service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MISMATCH));
        assertThat(comparisons(d)).isEqualTo(1);

        assertThatThrownBy(() -> service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH)))
                .satisfies(t -> assertThat(code(t)).isEqualTo(ErrorCode.WILL_COMPARISON_ALREADY_RECORDED));

        assertThat(comparisons(d)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT comparison_result FROM dbo.will_comparisons WHERE verification_case_id=?", String.class, d.f().caseId())).isEqualTo("MISMATCH");
        assertThat(notifications(d)).isEqualTo(1);
    }

    /** AC 3: two different Legal users race on the same paper; exactly one conclusion. */
    @Test
    void twoLegalUsersRacingOnSamePaperWriteExactlyOneConclusion() throws Exception {
        for (int round = 0; round < 5; round++) {
            Data d = data(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch start = new CountDownLatch(1);
            try {
                List<Future<Throwable>> futures = new ArrayList<>();
                for (CustomUserPrincipal who : List.of(d.f().legal(), d.secondLegal())) {
                    Callable<Throwable> task = () -> {
                        start.await();
                        try {
                            service().record(d.f().publicCaseId(), who, request(d, 0, Result.MATCH));
                            return null;
                        } catch (Throwable t) {
                            return t;
                        }
                    };
                    futures.add(pool.submit(task));
                }
                start.countDown();
                List<Throwable> out = new ArrayList<>();
                for (var f : futures) out.add(f.get(60, TimeUnit.SECONDS));
                assertThat(out.stream().filter(t -> t == null).count()).isEqualTo(1);
                out.stream().filter(t -> t != null)
                        .forEach(t -> assertThat(code(t)).isEqualTo(ErrorCode.WILL_COMPARISON_ALREADY_RECORDED));
            } finally {
                pool.shutdownNow();
            }
            assertThat(comparisons(d)).isEqualTo(1);
            assertThat(notifications(d)).isEqualTo(1);
            assertThat(audits(d)).isEqualTo(1);
        }
    }

    /** AC 4: a new paper gets its own conclusion and does not inherit the previous one. */
    @Test
    void newPaperGetsItsOwnConclusion() {
        Data d = data(2);
        service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH));
        service().record(d.f().publicCaseId(), d.f().legal(), request(d, 1, Result.MISMATCH));
        assertThat(comparisons(d)).isEqualTo(2);
        assertThat(count("will_comparisons", "verification_case_id=? AND comparison_result='MATCH'", d.f().caseId())).isEqualTo(1);
        assertThat(count("will_comparisons", "verification_case_id=? AND comparison_result='MISMATCH'", d.f().caseId())).isEqualTo(1);
    }

    /** AC 5 (independent part only): the old conclusion keeps its version/hash; a stale version gets no conclusion. */
    @Test
    void conclusionKeepsOriginalHashAndStaleVersionIsRejected() {
        Data d = data(2);
        service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH));
        long asset = jdbc.queryForObject("SELECT asset_id FROM dbo.assets WHERE public_id=?", Long.class, d.will().toString());
        version(asset, 2, d.f().userId());

        assertThat(jdbc.queryForObject("SELECT referenced_sha256_hash FROM dbo.will_comparisons WHERE verification_case_id=?", String.class, d.f().caseId())).isEqualTo("1".repeat(64));
        assertThatThrownBy(() -> service().record(d.f().publicCaseId(), d.f().legal(), request(d, 1, Result.MATCH)))
                .satisfies(t -> assertThat(code(t)).isEqualTo(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE));
        assertThat(comparisons(d)).isEqualTo(1);
    }

    /** AC 6: a failing audit or notification write rolls back the conclusion and every related row. */
    @Test
    void auditOrNotificationFailureRollsBackEverything() {
        for (String table : List.of("audit_logs", "workflow_notifications")) {
            Data d = data(1);
            String trigger = "TR_ps139_fail_" + table;
            jdbc.execute("CREATE TRIGGER dbo." + trigger + " ON dbo." + table + " AFTER INSERT AS THROW 50001, 'forced failure', 1");
            try {
                assertThatThrownBy(() -> service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH)));
            } finally {
                jdbc.execute("DROP TRIGGER dbo." + trigger);
            }
            assertThat(comparisons(d)).as("comparison rolled back after %s failure", table).isZero();
            assertThat(notifications(d)).isZero();
            assertThat(audits(d)).isZero();
            assertThat(jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE vault_id=?", String.class, d.f().vaultId())).isEqualTo("DOCUMENT_VERIFICATION");
            // The failure left no state behind, so the same operation can now be retried once.
            service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH));
            assertThat(comparisons(d)).isEqualTo(1);
        }
    }

    /** AC 7: retrying a committed operation is a conflict and creates no second notification or audit row. */
    @Test
    void retryAfterCommitCreatesNoDuplicateNotificationOrAudit() {
        Data d = data(1);
        service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH));
        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> service().record(d.f().publicCaseId(), d.f().legal(), request(d, 0, Result.MATCH)))
                    .satisfies(t -> assertThat(code(t)).isEqualTo(ErrorCode.WILL_COMPARISON_ALREADY_RECORDED));
        }
        assertThat(notifications(d)).isEqualTo(1);
        assertThat(audits(d)).isEqualTo(1);
        assertThat(comparisons(d)).isEqualTo(1);
    }
}

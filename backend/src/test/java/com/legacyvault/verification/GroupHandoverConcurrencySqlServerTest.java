package com.legacyvault.verification;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
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
import com.legacyvault.verification.group.GroupHandoverService;
import com.legacyvault.verification.group.GroupHandoverService.Body;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PS-121: real SQL Server races between delivery and the whole-group attendance gate (PS-119/120).
 * Each round uses a fresh disposable fixture; the only acceptable outcomes are the serial orders.
 * Any non-business exception (deadlock victim, lock timeout) fails the test.
 */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class GroupHandoverConcurrencySqlServerTest extends HandoverCompletionSqlSupport {

    private static final int ROUNDS = 5;

    /** True when every task of the last race had started before any task finished (real overlap). */
    private static volatile boolean lastRaceOverlapped;

    private static GroupHandoverService group() {
        return context.getBean(GroupHandoverService.class);
    }

    /** Runs the tasks at the same instant; returns null for success or the thrown exception. */
    private static List<Throwable> race(List<Callable<Object>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CountDownLatch start = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger slots = new java.util.concurrent.atomic.AtomicInteger();
        long[] begin = new long[tasks.size()];
        long[] end = new long[tasks.size()];
        try {
            List<Future<Throwable>> futures = new ArrayList<>();
            for (Callable<Object> task : tasks) {
                futures.add(pool.submit(() -> {
                    start.await();
                    int slot = slots.getAndIncrement();
                    begin[slot] = System.nanoTime();
                    try {
                        task.call();
                        return null;
                    } catch (Throwable t) {
                        return t;
                    } finally {
                        end[slot] = System.nanoTime();
                    }
                }));
            }
            start.countDown();
            List<Throwable> results = new ArrayList<>();
            for (Future<Throwable> f : futures) {
                results.add(f.get(60, TimeUnit.SECONDS));
            }
            long latestBegin = java.util.Arrays.stream(begin).max().getAsLong();
            long earliestEnd = java.util.Arrays.stream(end).min().getAsLong();
            lastRaceOverlapped = latestBegin < earliestEnd;
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private static void assertBusiness(Throwable t, ErrorCode... allowed) {
        assertThat(t).as("only business rejections are acceptable, not %s", t).isInstanceOf(BusinessException.class);
        assertThat(((BusinessException) t).getErrorCode()).isIn((Object[]) allowed);
    }

    private static int items(Ready r) {
        return count("handover_items",
                "handover_session_id IN (SELECT handover_session_id FROM dbo.handover_sessions WHERE public_id=?)",
                r.session().toString());
    }

    private static String status(Ready r) {
        return group().view(r.f().publicCaseId(), r.session(), r.f().legal(), false).state().status();
    }

    private static Callable<Object> missing(Ready r, long revision) {
        return () -> group().mutate(r.f().publicCaseId(), r.session(), null, UUID.randomUUID(), "ATTENDANCE",
                new Body(revision, Set.of(), "Recipient missing"), r.f().legal(), false);
    }

    private static Callable<Object> deliveryTask(Ready r) {
        return () -> {
            deliverWithoutLinking(r);
            return null;
        };
    }

    /** AC 19/20: delivery racing the first "missing" report is either before it or blocked, never after it. */
    @Test
    void deliveryRacingMissingReportNeverSucceedsAfterSuspension() throws Exception {
        for (int i = 0; i < ROUNDS; i++) {
            Ready r = ready(false);
            ensureLinkedAccount(r);
            long revision = group().view(r.f().publicCaseId(), r.session(), r.f().legal(), false).state().revision();

            List<Throwable> out = race(List.of(deliveryTask(r), missing(r, revision)));

            assertThat(out.get(1)).as("missing report must always commit").isNull();
            if (out.get(0) == null) {
                assertThat(items(r)).isEqualTo(1);
            } else {
                assertBusiness(out.get(0), ErrorCode.GROUP_HANDOVER_BLOCKED);
                assertThat(items(r)).isZero();
            }
            assertThat(status(r)).isEqualTo("SUSPENDED");
        }
    }

    /** AC 12/11: once the suspension has committed, every further delivery is rejected. */
    @Test
    void concurrentDeliveriesAfterSuspensionAreAllBlocked() throws Exception {
        Ready r = ready(false);
        ensureLinkedAccount(r);
        long revision = group().view(r.f().publicCaseId(), r.session(), r.f().legal(), false).state().revision();
        missing(r, revision).call();

        List<Throwable> out = race(List.of(deliveryTask(r), deliveryTask(r), deliveryTask(r)));

        out.forEach(t -> assertBusiness(t, ErrorCode.GROUP_HANDOVER_BLOCKED));
        assertThat(items(r)).isZero();
    }

    /** AC 24: two identical deliveries; the unique allocation key plus the locks allow exactly one. */
    @Test
    void twoConcurrentDeliveriesOfSameAssetCreateOneItem() throws Exception {
        Ready r = ready(false);
        ensureLinkedAccount(r);

        List<Throwable> out = race(List.of(deliveryTask(r), deliveryTask(r)));

        assertThat(out.stream().filter(t -> t == null).count()).isEqualTo(1);
        out.stream().filter(t -> t != null)
                .forEach(t -> assertBusiness(t, ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED));
        assertThat(items(r)).isEqualTo(1);
    }

    /** AC 23: Legal approval racing delivery on a suspended case; delivery is only allowed after READY. */
    @Test
    void deliveryRacingLegalReopeningOnlySucceedsAfterApproval() throws Exception {
        for (int i = 0; i < ROUNDS; i++) {
            Ready r = ready(false);
            ensureLinkedAccount(r);
            var f = r.f();
            long revision = group().view(f.publicCaseId(), r.session(), f.legal(), false).state().revision();
            missing(r, revision).call();
            recordFullAttendance(r);
            var view = group().view(f.publicCaseId(), r.session(), f.legal(), false);
            var request = group().mutate(f.publicCaseId(), r.session(), null, UUID.randomUUID(), "REQUEST",
                    new Body(view.state().revision(), null, "All present"), f.legal(), false);

            Callable<Object> approve = () -> group().mutate(f.publicCaseId(), r.session(),
                    request.state().requestId(), UUID.randomUUID(), "APPROVE",
                    new Body(request.state().revision(), null, "Reviewed"), f.legal(), true);
            List<Throwable> out = race(List.of(deliveryTask(r), approve));

            assertThat(out.get(1)).as("approval must commit").isNull();
            if (out.get(0) == null) {
                assertThat(items(r)).isEqualTo(1);
            } else {
                assertBusiness(out.get(0), ErrorCode.GROUP_HANDOVER_BLOCKED);
                assertThat(items(r)).isZero();
            }
            assertThat(status(r)).isEqualTo("READY");
        }
    }

    /** AC 25/26: a rolled-back delivery leaves no item and a retry afterwards still passes the guard. */
    @Test
    void rolledBackDeliveryLeavesNoStateAndRetrySucceeds() {
        Ready r = ready(false);
        ensureLinkedAccount(r);
        tx.executeWithoutResult(status -> {
            deliverWithoutLinking(r);
            status.setRollbackOnly();
        });
        assertThat(items(r)).isZero();
        assertThat(status(r)).isEqualTo("READY");

        deliverWithoutLinking(r);
        assertThat(items(r)).isEqualTo(1);
    }

    private static void changeAllocation(Ready r) {
        jdbc.update("UPDATE dbo.legal_basis_version_allocations SET allocation_description='Changed after approval' "
                + "WHERE status<>'SUPERSEDED' AND dossier_version_id IN (SELECT v.dossier_version_id "
                + "FROM dbo.legal_basis_dossier_versions v JOIN dbo.legal_basis_dossiers d "
                + "ON d.legal_basis_dossier_id=v.legal_basis_dossier_id WHERE d.verification_case_id=?)", r.f().caseId());
    }

    /** AC 16: a Legal reopening decision does not survive a later allocation change. */
    @Test
    void allocationChangeAfterLegalReopeningBlocksDelivery() {
        Ready r = ready(false);
        ensureLinkedAccount(r);
        var f = r.f();
        long revision = group().view(f.publicCaseId(), r.session(), f.legal(), false).state().revision();
        try {
            missing(r, revision).call();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        recordFullAttendance(r);
        var view = group().view(f.publicCaseId(), r.session(), f.legal(), false);
        var request = group().mutate(f.publicCaseId(), r.session(), null, UUID.randomUUID(), "REQUEST",
                new Body(view.state().revision(), null, "All present"), f.legal(), false);
        group().mutate(f.publicCaseId(), r.session(), request.state().requestId(), UUID.randomUUID(), "APPROVE",
                new Body(request.state().revision(), null, "Reviewed"), f.legal(), true);
        assertThat(status(r)).isEqualTo("READY");

        changeAllocation(r);

        Throwable t = null;
        try {
            deliverWithoutLinking(r);
        } catch (Throwable e) {
            t = e;
        }
        assertThat(t).as("delivery on stale reopening evidence must be rejected").isInstanceOf(BusinessException.class);
        assertThat(items(r)).isZero();
    }

    /**
     * AC 21: delivery racing two competing attendance reports built on the same revision (one complete, one with a
     * missing recipient). Exactly one report wins; delivery is never allowed on a suspended final state after it.
     */
    @Test
    void deliveryRacingCompetingAttendanceReportsStaysConsistent() throws Exception {
        int overlapped = 0;
        for (int i = 0; i < ROUNDS; i++) {
            Ready r = ready(false);
            ensureLinkedAccount(r);
            var view = group().view(r.f().publicCaseId(), r.session(), r.f().legal(), false);
            long revision = view.state().revision();
            Callable<Object> complete = () -> group().mutate(r.f().publicCaseId(), r.session(), null,
                    UUID.randomUUID(), "ATTENDANCE",
                    new Body(revision, view.requiredRecipientIds(), "Re-check complete"), r.f().legal(), false);

            List<Throwable> out = race(List.of(deliveryTask(r), missing(r, revision), complete));
            if (lastRaceOverlapped) {
                overlapped++;
            }

            boolean missingWon = out.get(1) == null;
            boolean completeWon = out.get(2) == null;
            assertThat(missingWon ^ completeWon).as("exactly one report may win revision %s", revision).isTrue();
            assertBusiness(missingWon ? out.get(2) : out.get(1), ErrorCode.GROUP_HANDOVER_STALE);
            if (completeWon) {
                assertThat(out.get(0)).as("a complete re-check keeps the gate open").isNull();
                assertThat(items(r)).isEqualTo(1);
                assertThat(status(r)).isEqualTo("READY");
            } else {
                if (out.get(0) == null) {
                    assertThat(items(r)).isEqualTo(1);
                } else {
                    assertBusiness(out.get(0), ErrorCode.GROUP_HANDOVER_BLOCKED);
                    assertThat(items(r)).isZero();
                }
                assertThat(status(r)).isEqualTo("SUSPENDED");
            }
        }
        assertThat(overlapped).as("at least one round must really overlap").isPositive();
    }

    /** AC 22: delivery racing an allocation change is either before it or rejected, never on the old allocation. */
    @Test
    void deliveryRacingAllocationChangeNeverUsesStaleAllocation() throws Exception {
        int overlapped = 0;
        int rejected = 0;
        for (int i = 0; i < ROUNDS; i++) {
            Ready r = ready(false);
            ensureLinkedAccount(r);

            List<Throwable> out = race(List.of(deliveryTask(r), () -> {
                changeAllocation(r);
                return null;
            }));
            if (lastRaceOverlapped) {
                overlapped++;
            }

            assertThat(out.get(1)).as("allocation update must commit without deadlock").isNull();
            if (out.get(0) == null) {
                assertThat(items(r)).isEqualTo(1);
            } else {
                rejected++;
                assertThat(out.get(0)).isInstanceOf(BusinessException.class);
                assertThat(items(r)).isZero();
            }
            if (out.get(0) != null) {
                // The change is committed: a retry on the old evidence must still be rejected.
                Throwable retry = null;
                try {
                    deliverWithoutLinking(r);
                } catch (Throwable e) {
                    retry = e;
                }
                assertThat(retry).isInstanceOf(BusinessException.class);
                assertThat(items(r)).isZero();
            }
        }
        assertThat(overlapped).as("at least one round must really overlap").isPositive();
    }
}

package com.legacyvault.verification;

import com.legacyvault.dms.DmsConfigRepository;
import com.legacyvault.dms.DmsScanJob;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DMS scan (ST-07/ST-08/ST-09) on real SQL Server: configs that cannot enter verification must not fill the 100-row
 * batch of the scheduled job and starve the configs that can. The job is called directly (the scheduler bean is removed
 * from this test context). Tests share one database and rows cannot be deleted (archived Vaults are read-only by a
 * trigger), so every assertion is limited to the configs created by the running test (dms_id above a baseline).
 */
class DmsScanStuckConfigsSqlServerTest extends LegalBasisSqlServerSupport {
    /** More than the job's batch size of 100. */
    private static final int STUCK = 105;

    private LocalDateTime now;
    private long baseline;
    private DmsScanJob job;
    private DmsConfigRepository configs;

    @BeforeEach
    void start() {
        baseline = jdbc.queryForObject("SELECT ISNULL(MAX(dms_id),0) FROM dbo.dms_configs", Long.class);
        now = LocalDateTime.now(ZoneOffset.UTC);
        job = context.getBean(DmsScanJob.class);
        configs = context.getBean(DmsConfigRepository.class);
    }

    private long owner(String vaultStatus) {
        UUID id = UUID.randomUUID();
        long user = jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status) OUTPUT inserted.user_id "
                + "VALUES(?,'DMS scan fixture',?,'unused','ACTIVE')", Long.class, id.toString(), id + "@example.test");
        if (vaultStatus != null) {
            jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name,status) VALUES(?,'DMS scan fixture',?)", user, vaultStatus);
        }
        return user;
    }

    private long vaultOf(long owner) {
        return jdbc.queryForObject("SELECT vault_id FROM dbo.vaults WHERE owner_user_id=?", Long.class, owner);
    }

    private void monitoring(long owner, LocalDateTime nextCheckAt) {
        jdbc.update("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,status,next_check_at) "
                + "VALUES(?,30,1,'MONITORING',?)", owner, Timestamp.valueOf(nextCheckAt));
    }

    private void triggered(long owner, LocalDateTime graceEndsAt) {
        jdbc.update("INSERT dbo.dms_configs(owner_user_id,check_interval_days,grace_period_days,status,next_check_at,triggered_at,"
                + "grace_period_ends_at) VALUES(?,30,1,'TRIGGERED',?,?,?)", owner, Timestamp.valueOf(graceEndsAt.minusDays(31)),
                Timestamp.valueOf(graceEndsAt.minusDays(1)), Timestamp.valueOf(graceEndsAt));
    }

    private String configStatus(long owner) {
        return jdbc.queryForObject("SELECT status FROM dbo.dms_configs WHERE owner_user_id=?", String.class, owner);
    }

    private String vaultStatus(long owner) {
        return jdbc.queryForObject("SELECT status FROM dbo.vaults WHERE owner_user_id=?", String.class, owner);
    }

    private int openCases(long owner) {
        return count("verification_cases", "vault_id=? AND status='OPEN'", vaultOf(owner));
    }

    /** Configs created by this test only. */
    private int countConfigs(String status) {
        return count("dms_configs", "dms_id>? AND status=?", baseline, status);
    }

    /** OPEN cases of Vaults whose owner has a config created by this test. */
    private int openCasesOfThisTest() {
        return count("verification_cases", "status='OPEN' AND vault_id IN (SELECT v.vault_id FROM dbo.vaults v "
                + "JOIN dbo.dms_configs d ON d.owner_user_id=v.owner_user_id WHERE d.dms_id>?)", baseline);
    }

    private java.util.List<Long> mine(java.util.List<Long> ids) {
        return ids.stream().filter(id -> id > baseline).toList();
    }

    @Test
    void graceExpiredConfigsThatCannotEnterVerificationDoNotBlockTheOnesThatCan() {
        // 105 older expired configs whose Vault is already AWAITING_VERIFICATION: the processor can never move them.
        for (int i = 0; i < STUCK; i++) triggered(owner("AWAITING_VERIFICATION"), now.minusDays(3));
        // One owner without any Vault, also unable to proceed.
        triggered(owner(null), now.minusDays(3));
        // The config that can proceed is newer, so it sorts after every stuck one.
        long eligible = owner("ACTIVE");
        triggered(eligible, now.minusHours(1));

        job.scanExpiredConfigs();

        assertThat(vaultStatus(eligible)).isEqualTo("AWAITING_VERIFICATION");
        assertThat(configStatus(eligible)).isEqualTo("GRACE_PERIOD_EXCEEDED");
        assertThat(openCases(eligible)).isEqualTo(1);
        // The stuck configs are untouched and are no longer candidates.
        assertThat(countConfigs("TRIGGERED")).isEqualTo(STUCK + 1);
        assertThat(mine(configs.findGracePeriodExpiredIds(LocalDateTime.now(ZoneOffset.UTC), PageRequest.of(0, 100)))).isEmpty();
        assertThat(openCasesOfThisTest()).isEqualTo(1);
    }

    @Test
    void archivedVaultsDoNotBlockMonitoringConfigsFromTriggering() {
        for (int i = 0; i < STUCK; i++) monitoring(owner("ARCHIVED"), now.minusDays(3));
        long eligible = owner("ACTIVE");
        monitoring(eligible, now.minusHours(1));
        // An owner without a Vault is still triggered by the processor, so it must remain a candidate.
        long noVault = owner(null);
        monitoring(noVault, now.minusHours(2));

        job.scanExpiredConfigs();

        assertThat(configStatus(eligible)).isEqualTo("TRIGGERED");
        assertThat(configStatus(noVault)).isEqualTo("TRIGGERED");
        assertThat(countConfigs("MONITORING")).isEqualTo(STUCK);
        assertThat(mine(configs.findExpiredIds(LocalDateTime.now(ZoneOffset.UTC), PageRequest.of(0, 100)))).isEmpty();
        // ST-07 only starts the Grace Period: nothing is opened and no Vault moves.
        assertThat(openCasesOfThisTest()).isZero();
        assertThat(vaultStatus(eligible)).isEqualTo("ACTIVE");
    }

    @Test
    void aConfigIsScannedAgainAsSoonAsItsVaultCanEnterVerification() {
        long owner = owner("AWAITING_VERIFICATION");
        triggered(owner, now.minusHours(2));

        job.scanExpiredConfigs();
        assertThat(configStatus(owner)).isEqualTo("TRIGGERED");
        assertThat(count("verification_cases", "vault_id=?", vaultOf(owner))).isZero();

        // Nothing was deleted or flagged, so the config qualifies again once the Vault is ACTIVE (for example Cancel Alert).
        jdbc.update("UPDATE dbo.vaults SET status='ACTIVE' WHERE owner_user_id=?", owner);
        job.scanExpiredConfigs();

        assertThat(configStatus(owner)).isEqualTo("GRACE_PERIOD_EXCEEDED");
        assertThat(vaultStatus(owner)).isEqualTo("AWAITING_VERIFICATION");
        assertThat(openCases(owner)).isEqualTo(1);
    }

    @Test
    void aVaultThatAlreadyHasAnOpenCaseIsNotACandidateAndNothingIsOpenedTwice() {
        long owner = owner("ACTIVE");
        triggered(owner, now.minusHours(2));
        context.getBean(VerificationCaseRepository.class).saveAndFlush(new VerificationCase(vaultOf(owner), now.minusHours(3), null));

        assertThat(mine(configs.findGracePeriodExpiredIds(LocalDateTime.now(ZoneOffset.UTC), PageRequest.of(0, 100)))).isEmpty();
        job.scanExpiredConfigs();

        assertThat(configStatus(owner)).isEqualTo("TRIGGERED");
        assertThat(vaultStatus(owner)).isEqualTo("ACTIVE");
        assertThat(openCases(owner)).isEqualTo(1);
    }
}

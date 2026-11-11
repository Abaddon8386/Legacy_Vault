package com.legacyvault.verification;

import com.legacyvault.admin.user.dto.AdminUserResponse;
import com.legacyvault.admin.user.service.AdminAccountStatus;
import com.legacyvault.admin.user.service.AdminUserManagementService;
import com.legacyvault.admin.user.service.AdminUserQueryService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the Admin user search and lock rules against real SQL Server (disposable database from the support class). */
class AdminUserStatusSqlServerTest extends LegalBasisSqlServerSupport {
    private static final Map<String, Long> IDS = new HashMap<>();
    private static final Map<String, UUID> PUBLIC_IDS = new HashMap<>();
    private static long adminId;

    @BeforeAll
    static void seed() {
        adminId = account("admin", "ACTIVE", false, null);
        account("active", "ACTIVE", false, null);
        account("vaultActive", "ACTIVE", false, "ACTIVE");
        account("archived", "ACTIVE", false, "ARCHIVED");
        for (String step : AdminAccountStatus.HANDOVER_VAULT_STATUSES) {
            account("step-" + step.toLowerCase().replace('_', '-'), "ACTIVE", false, step);
        }
        account("locked", "LOCKED", false, null);
        account("lockedInHandover", "LOCKED", false, "HANDOVER_IN_PROGRESS");
        account("pending", "PENDING", false, null);
        account("deleted", "ACTIVE", true, "ARCHIVED");
    }

    private static long account(String label, String status, boolean deleted, String vaultStatus) {
        UUID publicId = UUID.randomUUID();
        long id = jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status, deleted_at) "
                        + "OUTPUT inserted.user_id VALUES (?, ?, ?, 'unused', ?, CASE WHEN ? = 1 THEN SYSUTCDATETIME() ELSE NULL END)",
                Long.class, publicId.toString(), "Fixture " + label, label + "@statusfix.test", status, deleted ? 1 : 0);
        IDS.put(label, id);
        PUBLIC_IDS.put(label, publicId);
        if (vaultStatus != null) {
            jdbc.update("INSERT dbo.vaults (owner_user_id, vault_name, status) VALUES (?, 'Fixture vault', 'ACTIVE')", id);
            if (!"ACTIVE".equals(vaultStatus)) {
                jdbc.update("UPDATE dbo.vaults SET status = ? WHERE owner_user_id = ?", vaultStatus, id);
            }
        }
        return id;
    }

    private static List<AdminUserResponse> list(String query, String status) {
        return context.getBean(AdminUserQueryService.class).listUsers(query, null, status, null, 0, 100).content();
    }

    private static Map<String, String> statusByLabel(String status) {
        return list("statusfix", status).stream().collect(Collectors.toMap(
                user -> user.email().replace("@statusfix.test", ""), AdminUserResponse::status));
    }

    @Test
    void aFullUuidFindsExactlyThatAccountInAnyCaseAndPartialUuidsFindNothing() {
        UUID id = PUBLIC_IDS.get("archived");
        for (String text : List.of(id.toString(), id.toString().toUpperCase(), "  " + id + "  ")) {
            var found = list(text, null);
            assertEquals(1, found.size(), text);
            assertEquals(id, found.getFirst().publicId());
        }
        assertTrue(list(id.toString().substring(0, 13), null).isEmpty());
        assertTrue(list(id + "0", null).isEmpty());
        assertEquals(1, list(id.toString(), "ARCHIVED").size(), "UUID combines with the status filter");
        assertTrue(list(id.toString(), "ACTIVE").isEmpty());
        assertFalse(list("statusfix", null).isEmpty(), "name and email search still works");
        for (String hidden : List.of("deleted", "pending")) {
            assertTrue(list(PUBLIC_IDS.get(hidden).toString(), null).isEmpty(), hidden + " is not findable by UUID");
            assertTrue(list(hidden + "@statusfix.test", null).isEmpty(), hidden + " is not findable by email");
            assertTrue(list("Fixture " + hidden, null).isEmpty(), hidden + " is not findable by name");
        }
    }

    @Test
    void lockIsRefusedWhileTheVaultIsInHandoverOrArchivedAndFollowsTheVaultAfterwards() {
        var management = context.getBean(AdminUserManagementService.class);
        for (String label : List.of("archived", "step-unlocked", "step-awaiting-verification", "step-handover-in-progress")) {
            var failure = assertThrows(BusinessException.class,
                    () -> management.setLocked(adminId, PUBLIC_IDS.get(label), true, "test"), label);
            assertEquals(ErrorCode.ADMIN_ACCOUNT_IN_HANDOVER, failure.getErrorCode(), label);
        }
        assertEquals("ACTIVE", jdbc.queryForObject("SELECT status FROM dbo.users WHERE user_id = ?", String.class, IDS.get("archived")));

        assertEquals("LOCKED", management.setLocked(adminId, PUBLIC_IDS.get("vaultActive"), true, "test").status());
        assertEquals("ACTIVE", management.setLocked(adminId, PUBLIC_IDS.get("vaultActive"), false, null).status());

        // Nothing is stored: when the vault moves on, the very next read shows the new status.
        jdbc.update("UPDATE dbo.vaults SET status = 'AWAITING_VERIFICATION' WHERE owner_user_id = ?", IDS.get("vaultActive"));
        assertEquals("HANDOVER_IN_PROGRESS", statusByLabel(null).get("vaultActive"));
        jdbc.update("UPDATE dbo.vaults SET status = 'ACTIVE' WHERE owner_user_id = ?", IDS.get("vaultActive"));
        assertEquals("ACTIVE", statusByLabel(null).get("vaultActive"));
    }
}

package com.legacyvault.verification;

import com.legacyvault.admin.user.service.AdminUserQueryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AdminUserQuerySqlServerTest extends LegalBasisSqlServerSupport {
    @Test @Order(1)
    void accountAndVaultFiltersCombineBeforePaginationWithoutDuplicatingMultiRoleOwners() {
        var service = context.getBean(AdminUserQueryService.class);
        for (String state : List.of("AWAITING_VERIFICATION", "DOCUMENT_VERIFICATION", "WILL_VERIFICATION",
                "AWAITING_LEGAL_BASIS", "LEGAL_BASIS_VERIFICATION", "ON_HOLD", "UNLOCKED", "HANDOVER_IN_PROGRESS")) {
            seed("ACTIVE", state, true);
        }
        seed("ACTIVE", "ACTIVE", true);
        seed("ACTIVE", "ARCHIVED", true);
        seed("ACTIVE", null, true);
        seed("ACTIVE", null, false);
        long locked = seed("LOCKED", "ON_HOLD", true);
        long deleted = seed("ACTIVE", "ACTIVE", true);
        long pending = seed("PENDING", "ACTIVE", true);
        jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?", deleted);

        var first = service.listUsers(null, "ROLE_VAULT_OWNER", "ACTIVE", "IN_PROCESS", 0, 3);
        assertEquals(8, first.totalElements());
        assertEquals(3, first.totalPages());
        assertEquals(3, first.content().size());
        assertTrue(first.content().stream().allMatch(user -> user.status().equals("ACTIVE") && user.vaultStatus().equals("IN_PROCESS")));
        var last = service.listUsers(null, "ROLE_VAULT_OWNER", "ACTIVE", "IN_PROCESS", 2, 3);
        assertEquals(2, last.content().size());
        assertTrue(first.content().stream().noneMatch(user -> last.content().stream().anyMatch(other -> other.publicId().equals(user.publicId()))));
        for (String group : List.of("ACTIVE", "ARCHIVED", "NO_VAULT")) {
            var page = service.listUsers(null, "ROLE_VAULT_OWNER", "ACTIVE", group, 0, 20);
            assertEquals(1, page.totalElements(), group);
            assertEquals(group, page.content().getFirst().vaultStatus());
        }
        var lockedPage = service.listUsers(null, "ROLE_VAULT_OWNER", "LOCKED", "IN_PROCESS", 0, 20);
        assertEquals(1, lockedPage.totalElements());
        assertEquals(UUID.fromString(jdbc.queryForObject("SELECT public_id FROM dbo.users WHERE user_id=?", String.class, locked)),
                lockedPage.content().getFirst().publicId());
        var owners = service.listUsers(null, "ROLE_VAULT_OWNER", null, null, 0, 100);
        assertEquals(12, owners.totalElements());
        assertTrue(owners.content().stream().allMatch(user -> List.of("ACTIVE", "LOCKED").contains(user.accountStatus())));
        assertEquals(1, service.listUsers(null, null, "DELETED", null, 0, 20).totalElements());
        assertEquals(1, service.listUsers(null, null, "PENDING", null, 0, 20).totalElements());
        for (long legacy : List.of(pending, deleted)) {
            assertThrows(com.legacyvault.common.error.BusinessException.class,
                    () -> service.getUser(publicId(legacy), "ROLE_VAULT_OWNER"));
            assertTrue(List.of("PENDING", "DELETED").contains(service.getUser(publicId(legacy), null).accountStatus()));
        }
        assertThrows(com.legacyvault.common.error.BusinessException.class,
                () -> service.listUsers(null, "ROLE_VAULT_OWNER", "DELETED", "ACTIVE", 0, 20));
        var others = service.listUsers(null, "ROLE_STAFF_EXECUTOR", null, null, 0, 20);
        assertEquals(1, others.totalElements());
        assertNull(others.content().getFirst().vaultStatus());
        assertThrows(com.legacyvault.common.error.BusinessException.class,
                () -> service.listUsers(null, "ROLE_STAFF_EXECUTOR", null, "NO_VAULT", 0, 20));
    }

    @Test @Order(2)
    void participationIsScopedToTheSelectedRoleAndRemainsProcessingUntilAllRelatedVaultsEnd() {
        var service = context.getBean(AdminUserQueryService.class);
        var a = fixture(false);
        var b = fixture(false);
        long recipient = actor("ROLE_BENEFICIARY", "ACTIVE");
        long staff = actor("ROLE_STAFF_EXECUTOR", "ACTIVE");
        long legal = actor("ROLE_LEGAL_VERIFIER", "ACTIVE");
        long idleLegal = actor("ROLE_LEGAL_VERIFIER", "ACTIVE");
        long idleStaff = actor("ROLE_STAFF_EXECUTOR", "ACTIVE");
        long locked = actor("ROLE_BENEFICIARY", "LOCKED");
        long mixed = actor("ROLE_STAFF_EXECUTOR", "ACTIVE");
        for (String role : List.of("ROLE_BENEFICIARY", "ROLE_LEGAL_VERIFIER", "ROLE_STAFF_EXECUTOR")) {
            actor(role, "PENDING");
            long deletedActor = actor(role, "ACTIVE");
            jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?", deletedActor);
            var page = service.listUsers("Actor processing fixture", role, null, null, 0, 100);
            assertTrue(page.content().stream().allMatch(user -> List.of("ACTIVE", "LOCKED", "IN_PROCESS").contains(user.accountStatus())));
            assertThrows(com.legacyvault.common.error.BusinessException.class,
                    () -> service.getUser(publicId(deletedActor), role));
        }
        assertEquals(3, service.listUsers("Actor processing fixture", null, "PENDING", null, 0, 100).totalElements());
        assertEquals(3, service.listUsers("Actor processing fixture", null, "DELETED", null, 0, 100).totalElements());
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_BENEFICIARY'", mixed);
        for (var f : List.of(a, b)) {
            jdbc.update("UPDATE dbo.verification_cases SET assigned_staff_user_id=? WHERE verification_case_id=?", staff, f.caseId());
            for (long id : List.of(recipient, locked, mixed)) {
                jdbc.update("INSERT dbo.beneficiaries(vault_id,linked_user_id,full_name) VALUES (?, ?, 'Actor recipient')", f.vaultId(), id);
            }
            legalAudit(legal, f.vaultId(), "LEGAL_DEATH_DOCUMENT_DECIDED", null, false);
            legalAudit(legal, f.vaultId(), "DISTRIBUTION_DOCUMENTS_APPROVED", null, false);
            legalAudit(idleLegal, f.vaultId(), "EVIDENCE_FILE_READ", null, false);
            legalAudit(idleLegal, f.vaultId(), "LEGAL_DEATH_DOCUMENT_DECIDED", null, true);
            legalAudit(idleLegal, f.vaultId(), "HANDOVER_GROUP_CHANGED", "{\"operation\":\"REQUEST\"}", false);
        }
        for (String state : List.of("AWAITING_VERIFICATION", "DOCUMENT_VERIFICATION", "WILL_VERIFICATION",
                "AWAITING_LEGAL_BASIS", "LEGAL_BASIS_VERIFICATION", "ON_HOLD", "UNLOCKED", "HANDOVER_IN_PROGRESS")) {
            jdbc.update("UPDATE dbo.vaults SET status=? WHERE vault_id IN (?,?)", state, a.vaultId(), b.vaultId());
            for (String role : List.of("ROLE_BENEFICIARY", "ROLE_STAFF_EXECUTOR", "ROLE_LEGAL_VERIFIER")) {
                var page = service.listUsers("Actor processing fixture", role, "IN_PROCESS", null, 0, 1);
                assertEquals(role.equals("ROLE_BENEFICIARY") ? 2 : 1, page.totalElements(), state + role);
                assertTrue(page.content().stream().allMatch(user -> user.status().equals("ACTIVE") && user.accountStatus().equals("IN_PROCESS")));
                assertEquals(1, page.content().size());
            }
        }
        assertEquals("IN_PROCESS", service.getUser(publicId(mixed), "ROLE_BENEFICIARY").accountStatus());
        assertEquals("ACTIVE", service.getUser(publicId(mixed), "ROLE_STAFF_EXECUTOR").accountStatus());
        assertEquals("ACTIVE", service.getUser(publicId(idleLegal), "ROLE_LEGAL_VERIFIER").accountStatus());
        assertEquals("ACTIVE", service.getUser(publicId(idleStaff), "ROLE_STAFF_EXECUTOR").accountStatus());
        assertEquals("LOCKED", service.getUser(publicId(locked), "ROLE_BENEFICIARY").accountStatus());
        assertEquals(1, service.listUsers("Actor processing fixture", "ROLE_BENEFICIARY", "LOCKED", null, 0, 20).totalElements());
        assertEquals(0, service.listUsers("Actor processing fixture", "ROLE_BENEFICIARY", "ACTIVE", null, 0, 20).totalElements());
        var second = service.listUsers("Actor processing fixture", "ROLE_BENEFICIARY", "IN_PROCESS", null, 1, 1);
        assertEquals(2, second.totalPages());
        assertEquals(1, second.content().size());

        legalAudit(idleLegal, b.vaultId(), "HANDOVER_GROUP_CHANGED", "{\"operation\":\"APPROVE\"}", false);
        assertEquals("IN_PROCESS", service.getUser(publicId(idleLegal), "ROLE_LEGAL_VERIFIER").accountStatus());
        jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?", a.vaultId());
        assertEquals("IN_PROCESS", service.getUser(publicId(recipient), "ROLE_BENEFICIARY").accountStatus());
        jdbc.update("UPDATE dbo.verification_cases SET status='CANCELLED',closed_at=SYSUTCDATETIME() WHERE verification_case_id=?", b.caseId());
        assertEquals("ACTIVE", service.getUser(publicId(staff), "ROLE_STAFF_EXECUTOR").accountStatus());
        assertEquals("ACTIVE", service.getUser(publicId(legal), "ROLE_LEGAL_VERIFIER").accountStatus());
        jdbc.update("UPDATE dbo.vaults SET status='ARCHIVED' WHERE vault_id=?", b.vaultId());
        for (long id : List.of(recipient, staff, legal, mixed)) assertEquals("ACTIVE", service.getUser(publicId(id), null).accountStatus());
    }

    private long actor(String role, String status) {
        long id = seed(status, null, false);
        jdbc.update("UPDATE dbo.users SET full_name='Actor processing fixture' WHERE user_id=?", id);
        jdbc.update("DELETE dbo.user_roles WHERE user_id=?", id);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?", id, role);
        return id;
    }

    private UUID publicId(long id) {
        return UUID.fromString(jdbc.queryForObject("SELECT public_id FROM dbo.users WHERE user_id=?", String.class, id));
    }

    private void legalAudit(long actor, long vault, String action, String details, boolean historical) {
        jdbc.update("INSERT dbo.audit_logs(actor_user_id,vault_id,action,entity_type,actor_type,details,occurred_at) "
                        + "VALUES (?,?,?,'VERIFICATION_CASE','USER',?," + (historical ? "DATEADD(day,-1,SYSUTCDATETIME())" : "SYSUTCDATETIME()") + ")",
                actor, vault, action, details);
    }

    private long seed(String accountStatus, String vaultStatus, boolean owner) {
        UUID publicId = UUID.randomUUID();
        long id = jdbc.queryForObject("INSERT dbo.users (public_id, full_name, email, password_hash, status) "
                        + "OUTPUT inserted.user_id VALUES (?, 'Admin search fixture', ?, 'unused', ?)",
                Long.class, publicId.toString(), publicId + "@example.test", accountStatus);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code=?",
                id, owner ? "ROLE_VAULT_OWNER" : "ROLE_STAFF_EXECUTOR");
        if (owner) jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_BENEFICIARY'", id);
        if (vaultStatus != null) jdbc.update("INSERT dbo.vaults(owner_user_id,vault_name,status) VALUES (?, 'Admin search vault', ?)", id, vaultStatus);
        return id;
    }
}

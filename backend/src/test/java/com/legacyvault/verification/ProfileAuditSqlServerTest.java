package com.legacyvault.verification;

import com.legacyvault.auth.AuthService;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.common.security.CustomUserPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** SQL Server integration proof that scoped PS-79 profile updates and audit rows share a transaction. */
@EnabledIfEnvironmentVariable(named = "LEGAL_SQLSERVER_MASTER_URL", matches = ".*databaseName=master;.*")
class ProfileAuditSqlServerTest extends LegalBasisSqlServerSupport {

    @Test
    void profileChangesPersistSafeAuditRowsWithoutChangingEmailPasswordOrAuthVersion() {
        Fixture fixture = fixture(false);
        String oldEmail = fixture.legal().email();
        String oldPasswordHash = jdbc.queryForObject(
                "SELECT password_hash FROM dbo.users WHERE user_id = ?", String.class, fixture.userId());
        long oldAuthVersion = jdbc.queryForObject(
                "SELECT auth_version FROM dbo.users WHERE user_id = ?", Long.class, fixture.userId());
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                fixture.legal(), null, List.of());
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setFullName("Updated Profile Name");
        request.setPhoneNumber("+84901234567");

        context.getBean(AuthService.class).updateCurrentUser(authentication, request);

        var rows = jdbc.queryForList("""
                SELECT action, actor_user_id, entity_type, entity_id, details
                FROM dbo.audit_logs WHERE actor_user_id = ? ORDER BY audit_log_id
                """, fixture.userId());
        assertEquals(1, rows.size());
        assertEquals(List.of("AUTH_PROFILE_UPDATED"),
                rows.stream().map(row -> row.get("action").toString()).toList());
        for (var row : rows) {
            assertEquals(fixture.userId(), ((Number) row.get("actor_user_id")).longValue());
            assertEquals("USER", row.get("entity_type"));
            assertEquals(fixture.userId(), ((Number) row.get("entity_id")).longValue());
            String details = row.get("details").toString();
            assertTrue(details.contains("SUCCESS"));
            assertFalse(details.contains(oldEmail));
            assertFalse(details.contains("Updated Profile Name"));
            assertTrue(details.contains("fullName"));
            assertTrue(details.contains("phoneNumber"));
        }

        assertEquals(oldEmail, jdbc.queryForObject(
                "SELECT email FROM dbo.users WHERE user_id = ?", String.class, fixture.userId()));
        assertEquals(oldPasswordHash, jdbc.queryForObject(
                "SELECT password_hash FROM dbo.users WHERE user_id = ?", String.class, fixture.userId()));
        assertEquals(oldAuthVersion, jdbc.queryForObject(
                "SELECT auth_version FROM dbo.users WHERE user_id = ?", Long.class, fixture.userId()));
    }

    @Test
    void auditInsertFailureRollsBackTheProfileUpdate() {
        Fixture fixture = fixture(false);
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                fixture.legal(), null, List.of());
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setFullName("Must Roll Back");
        jdbc.execute("""
                CREATE TRIGGER dbo.TR_TestFailProfileAudit ON dbo.audit_logs AFTER INSERT AS
                BEGIN
                    IF EXISTS (SELECT 1 FROM inserted WHERE action = 'AUTH_PROFILE_UPDATED')
                        THROW 51079, 'test profile audit failure', 1;
                END
                """);
        try {
            assertThrows(RuntimeException.class,
                    () -> context.getBean(AuthService.class).updateCurrentUser(authentication, request));
        } finally {
            jdbc.execute("DROP TRIGGER dbo.TR_TestFailProfileAudit");
        }

        assertEquals("Legal fixture", jdbc.queryForObject(
                "SELECT full_name FROM dbo.users WHERE user_id = ?", String.class, fixture.userId()));
        assertEquals(0, count("audit_logs", "actor_user_id = ? AND action = 'AUTH_PROFILE_UPDATED'",
                fixture.userId()));
    }
}

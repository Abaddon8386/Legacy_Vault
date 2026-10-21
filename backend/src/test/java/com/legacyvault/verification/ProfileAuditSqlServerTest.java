package com.legacyvault.verification;

import com.legacyvault.auth.AuthService;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.common.security.CustomUserPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

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

    @Test
    void emailAndPasswordUpdateReauthenticatesPersistsAtomicallyAuditsSafelyAndRevokesOldJwt() throws Exception {
        Fixture fixture = fixture(false);
        String currentPassword = "Current-password-123";
        String nextPassword = "Next-password-456";
        String nextEmail = "changed-" + fixture.legal().publicId() + "@example.test";
        PasswordEncoder encoder = context.getBean(PasswordEncoder.class);
        jdbc.update("UPDATE dbo.users SET password_hash=?, password_login_enabled=1, email_verified_at=SYSUTCDATETIME() WHERE user_id=?",
                encoder.encode(currentPassword), fixture.userId());
        AuthService auth = context.getBean(AuthService.class);
        String oldJwt = auth.login(new LoginRequest(fixture.legal().email(), currentPassword)).accessToken();

        var authentication = UsernamePasswordAuthenticationToken.authenticated(fixture.legal(), null, List.of());
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail(" " + nextEmail.toUpperCase(java.util.Locale.ROOT) + " ");
        request.setPassword(nextPassword);
        request.setCurrentPassword(currentPassword);
        auth.updateCurrentUser(authentication, request);

        assertEquals(nextEmail.toLowerCase(java.util.Locale.ROOT), jdbc.queryForObject(
                "SELECT email FROM dbo.users WHERE user_id=?", String.class, fixture.userId()));
        assertNull(jdbc.queryForObject("SELECT email_verified_at FROM dbo.users WHERE user_id=?",
                java.time.LocalDateTime.class, fixture.userId()));
        String storedHash = jdbc.queryForObject("SELECT password_hash FROM dbo.users WHERE user_id=?",
                String.class, fixture.userId());
        assertNotEquals(nextPassword, storedHash);
        assertTrue(encoder.matches(nextPassword, storedHash));
        assertEquals(1L, jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?",
                Long.class, fixture.userId()));

        var auditRows = jdbc.queryForList("SELECT action,details FROM dbo.audit_logs WHERE actor_user_id=? ORDER BY audit_log_id",
                fixture.userId());
        var profileAudit = auditRows.stream().filter(row -> "AUTH_PROFILE_UPDATED".equals(row.get("action"))).toList();
        assertEquals(1, profileAudit.size());
        String details = profileAudit.getFirst().get("details").toString();
        assertTrue(details.contains("email"));
        assertTrue(details.contains("password"));
        assertFalse(details.contains(currentPassword));
        assertFalse(details.contains(nextPassword));
        assertFalse(details.contains(storedHash));
        assertFalse(details.contains(nextEmail));

        var mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context).apply(springSecurity()).build();
        assertEquals(401, mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + oldJwt))
                .andReturn().getResponse().getStatus());
        var newLogin = auth.login(new LoginRequest(nextEmail.toLowerCase(java.util.Locale.ROOT), nextPassword));
        assertEquals(200, mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + newLogin.accessToken()))
                .andReturn().getResponse().getStatus());
    }

    @Test
    void failedProfileReauthenticationLeavesEmailPasswordAndAuthVersionUntouched() {
        Fixture fixture = fixture(false);
        String oldEmail = fixture.legal().email();
        String oldPassword = "Current-password-123";
        PasswordEncoder encoder = context.getBean(PasswordEncoder.class);
        String oldHash = encoder.encode(oldPassword);
        jdbc.update("UPDATE dbo.users SET password_hash=?, password_login_enabled=1 WHERE user_id=?", oldHash, fixture.userId());
        ProfileUpdateRequest request = new ProfileUpdateRequest();
        request.setEmail("must-not-save@example.test");
        request.setPassword("Next-password-456");
        request.setCurrentPassword("wrong-password-123");

        assertThrows(com.legacyvault.common.error.BusinessException.class,
                () -> context.getBean(AuthService.class).updateCurrentUser(
                        UsernamePasswordAuthenticationToken.authenticated(fixture.legal(), null, List.of()), request));

        assertEquals(oldEmail, jdbc.queryForObject("SELECT email FROM dbo.users WHERE user_id=?", String.class, fixture.userId()));
        assertEquals(oldHash, jdbc.queryForObject("SELECT password_hash FROM dbo.users WHERE user_id=?", String.class, fixture.userId()));
        assertEquals(0L, jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?", Long.class, fixture.userId()));
        assertEquals(0, count("audit_logs", "actor_user_id=? AND action='AUTH_PROFILE_UPDATED'", fixture.userId()));
        assertEquals(1, count("audit_logs", "actor_user_id=? AND action='REAUTH_FAILED'", fixture.userId()));
    }
}

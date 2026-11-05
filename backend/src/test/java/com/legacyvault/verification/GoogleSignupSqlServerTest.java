package com.legacyvault.verification;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.AuthController;
import com.legacyvault.auth.AuthService;
import com.legacyvault.auth.GoogleAuthService;
import com.legacyvault.auth.GoogleIdTokenVerifier;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.PasswordSetupRequest;
import com.legacyvault.auth.repository.GoogleLoginCredentialUseRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.user.repository.ExternalAuthIdentityRepository;
import com.legacyvault.user.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Real SQL Server: first-time Google sign-up, no merge by email, race safety and first password setup. */
class GoogleSignupSqlServerTest extends LegalBasisSqlServerSupport {
    private final GoogleIdTokenVerifier verifier = mock(GoogleIdTokenVerifier.class);

    private GoogleAuthService google() {
        return new GoogleAuthService(verifier,
                context.getBean(ExternalAuthIdentityRepository.class),
                context.getBean(UserRepository.class),
                context.getBean(GoogleLoginCredentialUseRepository.class),
                context.getBean(AuthService.class),
                context.getBean(AuditService.class));
    }

    /** The manually built service has no Spring proxy, so each login attempt gets its own transaction here. */
    private GoogleAuthService transactionalGoogle() {
        return new GoogleAuthService(verifier,
                context.getBean(ExternalAuthIdentityRepository.class),
                context.getBean(UserRepository.class),
                context.getBean(GoogleLoginCredentialUseRepository.class),
                context.getBean(AuthService.class),
                context.getBean(AuditService.class)) {
            @Override
            public LoginResponse login(GoogleLoginRequest request) {
                return tx.execute(status -> super.login(request));
            }
        };
    }

    private String credential(String subject, String email, boolean verified) {
        String token = "token-" + UUID.randomUUID();
        when(verifier.verify(token)).thenReturn(new GoogleIdTokenVerifier.VerifiedGoogleCredential(
                subject, UUID.randomUUID().toString().replace("-", "").repeat(2), Instant.now().plusSeconds(300),
                email, verified, "Google Person"));
        return token;
    }

    private String login(String token) {
        return tx.execute(status -> google().login(new GoogleLoginRequest(token)).accessToken());
    }

    private static ErrorCode codeOf(Runnable action) {
        return assertThrows(BusinessException.class, action::run).getErrorCode();
    }

    private long scalar(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    @Test
    void newGoogleUserGetsActiveOwnerWithoutPasswordAndCanSignInAgain() {
        String email = "new-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();

        assertNotNull(login(credential(subject, email, true)));

        var user = jdbc.queryForMap("SELECT user_id, status, password_login_enabled, email_verified_at, full_name "
                + "FROM dbo.users WHERE email = ?", email);
        long userId = ((Number) user.get("user_id")).longValue();
        assertEquals("ACTIVE", user.get("status"));
        assertEquals(Boolean.FALSE, user.get("password_login_enabled"));
        assertNotNull(user.get("email_verified_at"));
        assertEquals("Google Person", user.get("full_name"));
        assertEquals(List.of("ROLE_VAULT_OWNER"), jdbc.queryForList(
                "SELECT r.role_code FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id WHERE ur.user_id = ?",
                String.class, userId));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE provider_code='GOOGLE' "
                + "AND subject = ? AND user_id = ?", subject, userId));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='AUTH_REGISTERED' AND actor_user_id = ?", userId));

        // Second visit with a fresh credential signs in through the new mapping and creates nothing.
        assertNotNull(login(credential(subject, email, true)));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
    }

    @Test
    void existingEmailIsNotMergedAndCreatesNothing() {
        String email = "owner-" + UUID.randomUUID() + "@example.test";
        jdbc.update("INSERT dbo.users(public_id,full_name,email,password_hash,status,password_login_enabled) "
                + "VALUES (?,'Owner',?,'unused','ACTIVE',1)", UUID.randomUUID().toString(), email);
        String subject = "sub-" + UUID.randomUUID();
        String token = credential(subject, email, true);

        assertEquals(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED, codeOf(() -> login(token)));

        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", subject));
    }

    @Test
    void unverifiedGoogleEmailCreatesNothing() {
        String email = "unverified-" + UUID.randomUUID() + "@example.test";
        String token = credential("sub-" + UUID.randomUUID(), email, false);

        assertEquals(ErrorCode.GOOGLE_EMAIL_NOT_VERIFIED, codeOf(() -> login(token)));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
    }

    @Test
    void lockedLinkedAccountStillCannotSignIn() {
        String email = "locked-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        login(credential(subject, email, true));
        jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE email = ?", email);
        String token = credential(subject, email, true);

        assertEquals(ErrorCode.INVALID_CREDENTIALS, codeOf(() -> login(token)));
    }

    @Test
    void replayedCredentialCannotSignUpTwice() {
        String email = "replay-" + UUID.randomUUID() + "@example.test";
        String token = credential("sub-" + UUID.randomUUID(), email, true);
        login(token);

        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, codeOf(() -> login(token)));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
    }

    @Test
    void parallelSignUpsForTheSameGoogleUserCreateOneAccountAndEveryRequestSignsIn() throws Exception {
        String email = "race-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        int attempts = 6;
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < attempts; i++) tokens.add(credential(subject, email, true));

        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<String>> results = new ArrayList<>();
        for (String token : tokens) {
            Callable<String> task = () -> {
                start.await();
                try {
                    // Through the controller, like a real request: a lost race is retried once there.
                    AuthController controller = new AuthController(context.getBean(AuthService.class), transactionalGoogle());
                    return controller.googleLogin(new GoogleLoginRequest(token)).getBody().accessToken() != null
                            ? "OK" : "NO_TOKEN";
                } catch (BusinessException exception) {
                    return exception.getErrorCode().name();
                }
            };
            results.add(pool.submit(task));
        }
        start.countDown();
        List<String> outcomes = new ArrayList<>();
        for (Future<String> result : results) outcomes.add(result.get());
        pool.shutdown();

        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email), outcomes.toString());
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", subject));
        // Same Google user in every request, so none of them may be told the email belongs to someone else.
        for (String outcome : outcomes) {
            assertEquals("OK", outcome, outcomes.toString());
        }
    }

    @Test
    void googleOnlyAccountCannotLinkAnotherGoogleUntilItHasAPassword() {
        String email = "link-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        login(credential(subject, email, true));
        long userId = scalar("SELECT user_id FROM dbo.users WHERE email = ?", email);
        String otherSubject = "sub-" + UUID.randomUUID();
        String otherToken = credential(otherSubject, "someone-else@example.test", true);

        assertEquals(ErrorCode.PASSWORD_NOT_SET, codeOf(
                () -> tx.execute(status -> google().linkIdentity(new GoogleLoginRequest(otherToken), userId))));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", otherSubject));

        // After the first password is set (with the original Google), linking another Google is allowed again.
        assertTrue(setupPassword(userId, "Brand-new-pass-1", credential(subject, email, true)).passwordLoginEnabled());
        assertTrue(tx.execute(status -> google().linkIdentity(new GoogleLoginRequest(otherToken), userId)).linked());
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ? AND user_id = ?",
                otherSubject, userId));
    }

    @Test
    void googleOnlyAccountSetsPasswordOnceWithFreshCredentialThenUsesItNormally() {
        String email = "setpw-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        login(credential(subject, email, true));
        long userId = scalar("SELECT user_id FROM dbo.users WHERE email = ?", email);
        AuthService auth = context.getBean(AuthService.class);
        PasswordReauthService reauth = context.getBean(PasswordReauthService.class);

        // Before: password login refused, reauth says "set a password", and that is not counted as a failure.
        assertEquals(ErrorCode.INVALID_CREDENTIALS, codeOf(() -> auth.login(new LoginRequest(email, "Brand-new-pass-1"))));
        assertEquals(ErrorCode.PASSWORD_NOT_SET, codeOf(() -> reauth.requirePassword(userId, null, "anything")));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='REAUTH_FAILED' AND actor_user_id = ?", userId));

        long versionBefore = scalar("SELECT auth_version FROM dbo.users WHERE user_id = ?", userId);
        assertTrue(setupPassword(userId, "Brand-new-pass-1", credential(subject, email, true)).passwordLoginEnabled());
        assertEquals(versionBefore, scalar("SELECT auth_version FROM dbo.users WHERE user_id = ?", userId));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='AUTH_PASSWORD_SET' AND actor_user_id = ?", userId));

        // After: normal password user.
        reauth.requirePassword(userId, null, "Brand-new-pass-1");
        assertNotNull(tx.execute(status -> auth.login(new LoginRequest(email, "Brand-new-pass-1"), "127.0.0.1")));
        assertEquals(ErrorCode.PASSWORD_ALREADY_SET, codeOf(
                () -> setupPassword(userId, "Another-pass-22", credential(subject, email, true))));
    }

    @Test
    void passwordSetupWithCredentialOfAnotherGoogleAccountIsRejectedAndChangesNothing() {
        String mail = "owner-a-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        login(credential(subject, mail, true));
        long userId = scalar("SELECT user_id FROM dbo.users WHERE email = ?", mail);
        String otherMail = "owner-b-" + UUID.randomUUID() + "@example.test";
        String otherSubject = "sub-" + UUID.randomUUID();
        login(credential(otherSubject, otherMail, true));

        // Signed in as A, but the Google token belongs to B.
        assertEquals(ErrorCode.GOOGLE_IDENTITY_MISMATCH, codeOf(
                () -> setupPassword(userId, "Brand-new-pass-1", credential(otherSubject, otherMail, true))));
        // A token whose subject is linked to nobody.
        assertEquals(ErrorCode.GOOGLE_IDENTITY_MISMATCH, codeOf(
                () -> setupPassword(userId, "Brand-new-pass-1", credential("sub-" + UUID.randomUUID(), mail, true))));

        assertEquals(Boolean.FALSE, jdbc.queryForObject(
                "SELECT password_login_enabled FROM dbo.users WHERE user_id = ?", Boolean.class, userId));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='AUTH_PASSWORD_SET' AND actor_user_id = ?", userId));
    }

    @Test
    void passwordSetupCredentialIsSingleUseButSurvivesAPasswordPolicyFailure() {
        String email = "reuse-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        login(credential(subject, email, true));
        long userId = scalar("SELECT user_id FROM dbo.users WHERE email = ?", email);

        String token = credential(subject, email, true);
        // Weak password: whole transaction rolls back, so the token is not burned.
        assertEquals(ErrorCode.PASSWORD_POLICY, codeOf(() -> setupPassword(userId, "short", token)));
        assertTrue(setupPassword(userId, "Brand-new-pass-1", token).passwordLoginEnabled());

        // Once used, the same token cannot be replayed.
        String replayed = credential(subject, email, true);
        assertEquals(ErrorCode.PASSWORD_ALREADY_SET, codeOf(() -> setupPassword(userId, "Another-pass-22", replayed)));
        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, codeOf(() -> setupPassword(userId, "Another-pass-22", token)));
    }

    private com.legacyvault.auth.dto.PasswordSetupResponse setupPassword(long userId, String password, String token) {
        return tx.execute(status -> google().setupPassword(userId, new PasswordSetupRequest(password, token)));
    }
}

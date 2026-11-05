package com.legacyvault.verification;

import com.legacyvault.audit.AuditService;
import com.legacyvault.auth.AuthController;
import com.legacyvault.auth.AuthService;
import com.legacyvault.auth.GoogleAuthService;
import com.legacyvault.auth.GoogleIdTokenVerifier;
import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.dto.PasswordSetupRequest;
import com.legacyvault.auth.repository.GoogleLoginCredentialUseRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.PasswordReauthService;
import com.legacyvault.user.repository.ExternalAuthIdentityRepository;
import com.legacyvault.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import com.jayway.jsonpath.JsonPath;
import com.legacyvault.common.error.GlobalExceptionHandler;
import jakarta.persistence.EntityManagerFactory;
import org.mockito.AdditionalAnswers;
import org.mockito.Mockito;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.http.MediaType;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
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

    private final java.util.Map<String, String> hashes = new java.util.concurrent.ConcurrentHashMap<>();

    private String credential(String subject, String email, boolean verified) {
        String token = "token-" + UUID.randomUUID();
        String hash = UUID.randomUUID().toString().replace("-", "").repeat(2);
        hashes.put(token, hash);
        when(verifier.verify(token)).thenReturn(new GoogleIdTokenVerifier.VerifiedGoogleCredential(
                subject, hash, Instant.now().plusSeconds(300), email, verified, "Google Person"));
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

    // ------------------------------------------------------------------------------------------------------------
    // Sign-up races. The service is wrapped in Spring's real TransactionInterceptor (reads the actual @Transactional
    // annotations) and called through AuthController + GlobalExceptionHandler with Open-EntityManager-In-View, which
    // Spring Boot enables by default (no spring.jpa.open-in-view override in application.yaml).
    // ------------------------------------------------------------------------------------------------------------

    private GoogleAuthService proxied(UserRepository usersRepository) {
        GoogleAuthService target = new GoogleAuthService(verifier,
                context.getBean(ExternalAuthIdentityRepository.class), usersRepository,
                context.getBean(GoogleLoginCredentialUseRepository.class),
                context.getBean(AuthService.class), context.getBean(AuditService.class));
        ProxyFactory factory = new ProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(context.getBean(PlatformTransactionManager.class),
                new AnnotationTransactionAttributeSource()));
        return (GoogleAuthService) factory.getProxy();
    }

    private MockMvc mvc(GoogleAuthService googleService) {
        OpenEntityManagerInViewInterceptor osiv = new OpenEntityManagerInViewInterceptor();
        osiv.setEntityManagerFactory(context.getBean(EntityManagerFactory.class));
        return MockMvcBuilders.standaloneSetup(new AuthController(context.getBean(AuthService.class), googleService))
                .setControllerAdvice(context.getBean(GlobalExceptionHandler.class))
                .addInterceptors(new org.springframework.web.servlet.handler.WebRequestHandlerInterceptorAdapter(osiv)).build();
    }

    private static MvcResult post(MockMvc mvc, String token) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\"" + token + "\"}")).andReturn();
    }

    private static List<MvcResult> concurrently(MockMvc mvc, List<String> tokens) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tokens.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();
        for (String token : tokens) {
            futures.add(pool.submit(() -> {
                start.await();
                return post(mvc, token);
            }));
        }
        start.countDown();
        List<MvcResult> results = new ArrayList<>();
        for (Future<MvcResult> future : futures) results.add(future.get(60, TimeUnit.SECONDS));
        pool.shutdown();
        return results;
    }

    /** Both existsByEmail checks finish (and return false) before either request starts inserting. */
    private UserRepository usersWithBarrier(int parties) {
        UserRepository real = context.getBean(UserRepository.class);
        CyclicBarrier barrier = new CyclicBarrier(parties);
        AtomicInteger calls = new AtomicInteger();
        UserRepository delegating = mock(UserRepository.class, AdditionalAnswers.delegatesTo(real));
        doAnswer(call -> {
            boolean exists = real.existsByEmail(call.getArgument(0));
            if (calls.incrementAndGet() <= parties) barrier.await(30, TimeUnit.SECONDS);
            return exists;
        }).when(delegating).existsByEmail(anyString());
        return delegating;
    }

    private static String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString();
    }

    private static String userId(MvcResult result) throws Exception {
        return JsonPath.read(body(result), "$.user.id");
    }

    private static String errorCode(MvcResult result) throws Exception {
        return JsonPath.read(body(result), "$.code");
    }

    private long verifyCalls(List<String> tokens) {
        return Mockito.mockingDetails(verifier).getInvocations().stream()
                .filter(call -> call.getMethod().getName().equals("verify") && tokens.contains(call.getArgument(0)))
                .count();
    }

    private long credentialRows(List<String> tokens) {
        long rows = 0;
        for (String token : tokens) {
            rows += scalar("SELECT COUNT(*) FROM dbo.google_login_credential_uses WHERE credential_hash = ?", hashes.get(token));
        }
        return rows;
    }

    /** Exactly one complete account for this Google identity, and nothing half-created. */
    private long assertSingleCompleteAccount(String email, String subject) {
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email), "users");
        long userId = scalar("SELECT user_id FROM dbo.users WHERE email = ?", email);
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE provider_code='GOOGLE' AND subject = ?", subject), "identities");
        assertEquals(userId, scalar("SELECT user_id FROM dbo.external_auth_identities WHERE provider_code='GOOGLE' AND subject = ?", subject));
        assertEquals(List.of("ROLE_VAULT_OWNER"), jdbc.queryForList(
                "SELECT r.role_code FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id WHERE ur.user_id = ?",
                String.class, userId), "roles");
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.audit_logs WHERE action='AUTH_REGISTERED' AND actor_user_id = ?", userId), "registration audit");
        assertEquals(Boolean.FALSE, jdbc.queryForObject("SELECT password_login_enabled FROM dbo.users WHERE user_id = ?", Boolean.class, userId));
        return userId;
    }

    @Test
    void sixParallelRequestsForTheSameGoogleIdentityCreateOneAccountAndAllSignIn() throws Exception {
        String email = "race6-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 6; i++) tokens.add(credential(subject, email, true));
        MockMvc mvc = mvc(proxied(context.getBean(UserRepository.class)));

        List<MvcResult> results = concurrently(mvc, tokens);

        for (MvcResult result : results) {
            assertEquals(200, result.getResponse().getStatus(), body(result));
            assertNotNull(JsonPath.read(body(result), "$.accessToken"));
        }
        assertEquals(1, results.stream().map(r -> {
            try { return userId(r); } catch (Exception e) { throw new IllegalStateException(e); }
        }).distinct().count(), "every request must sign in the same account");
        long userId = assertSingleCompleteAccount(email, subject);
        assertEquals(6, credentialRows(tokens), "each credential is consumed exactly once");

        // Sent again after sign-up finished: signs in, creates nothing; a used credential is still refused.
        MvcResult again = post(mvc, credential(subject, email, true));
        assertEquals(200, again.getResponse().getStatus(), body(again));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
        assertEquals(userId, scalar("SELECT user_id FROM dbo.users WHERE email = ?", email));
        MvcResult replay = post(mvc, tokens.get(0));
        assertEquals(401, replay.getResponse().getStatus());
        assertEquals("INVALID_GOOGLE_CREDENTIAL", errorCode(replay));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", subject));
    }

    @Test
    void loserOfASignUpRaceIsFullyRolledBackAndThenSignsInThroughTheRetry() throws Exception {
        String email = "loser-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        List<String> tokens = List.of(credential(subject, email, true), credential(subject, email, true));
        MockMvc mvc = mvc(proxied(usersWithBarrier(2)));

        List<MvcResult> results = concurrently(mvc, tokens);

        for (MvcResult result : results) assertEquals(200, result.getResponse().getStatus(), body(result));
        assertEquals(userId(results.get(0)), userId(results.get(1)));
        assertSingleCompleteAccount(email, subject);
        // Two requests verified once each, plus exactly one retry of the loser: proves the race path really ran.
        assertEquals(3, verifyCalls(tokens));
        // The loser's first attempt had consumed its credential inside the rolled-back transaction. Had that not been
        // rolled back, the retry would have hit the primary key and answered 401 instead of 200.
        assertEquals(2, credentialRows(tokens));
    }

    @Test
    void raceBetweenDifferentGoogleSubjectsWithTheSameEmailNeverMergesAccounts() throws Exception {
        String email = "twins-" + UUID.randomUUID() + "@example.test";
        String subjectA = "sub-a-" + UUID.randomUUID();
        String subjectB = "sub-b-" + UUID.randomUUID();
        List<String> tokens = List.of(credential(subjectA, email, true), credential(subjectB, email, true));
        MockMvc mvc = mvc(proxied(usersWithBarrier(2)));

        List<MvcResult> results = concurrently(mvc, tokens);

        List<Integer> statuses = results.stream().map(r -> r.getResponse().getStatus()).sorted().toList();
        assertEquals(List.of(200, 409), statuses, results.stream().map(r -> {
            try { return body(r); } catch (Exception e) { return "?"; }
        }).toList().toString());
        MvcResult loser = results.stream().filter(r -> r.getResponse().getStatus() == 409).findFirst().orElseThrow();
        assertEquals("GOOGLE_EMAIL_ALREADY_REGISTERED", errorCode(loser));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject IN (?, ?)", subjectA, subjectB),
                "only the winner's Google identity exists; the loser was not linked by email");
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.audit_logs a JOIN dbo.users u ON u.user_id = a.actor_user_id "
                + "WHERE a.action = 'AUTH_REGISTERED' AND u.email = ?", email));
    }

    @Test
    void sameGoogleUserWaitingBehindAnUncommittedAccountIsSignedInNotToldToUseAPassword() throws Exception {
        String email = "behind-" + UUID.randomUUID() + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        String token = credential(subject, email, true);
        MockMvc mvc = mvc(proxied(context.getBean(UserRepository.class)));
        DataSource dataSource = context.getBean(DataSource.class);

        long userId;
        try (Connection winner = dataSource.getConnection()) {
            winner.setAutoCommit(false);
            // The winning request has inserted the account but not yet the Google identity, and has not committed.
            try (PreparedStatement insert = winner.prepareStatement(
                    "INSERT dbo.users(public_id,full_name,email,password_hash,status,password_login_enabled,email_verified_at) "
                            + "OUTPUT inserted.user_id VALUES (?,'Google Person',?,'unused','ACTIVE',0,SYSUTCDATETIME())")) {
                insert.setString(1, UUID.randomUUID().toString());
                insert.setString(2, email);
                try (ResultSet keys = insert.executeQuery()) {
                    keys.next();
                    userId = keys.getLong(1);
                }
            }
            try (PreparedStatement role = winner.prepareStatement(
                    "INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'")) {
                role.setLong(1, userId);
                role.executeUpdate();
            }

            ExecutorService pool = Executors.newSingleThreadExecutor();
            Future<MvcResult> loser = pool.submit(() -> post(mvc, token));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (scalar("SELECT COUNT(*) FROM sys.dm_exec_requests WHERE blocking_session_id > 0") == 0) {
                assertTrue(System.nanoTime() < deadline, "the second request never blocked behind the uncommitted account");
                Thread.sleep(100);
            }
            try (PreparedStatement identity = winner.prepareStatement(
                    "INSERT dbo.external_auth_identities(provider_code,subject,user_id) VALUES ('GOOGLE',?,?)")) {
                identity.setString(1, subject);
                identity.setLong(2, userId);
                identity.executeUpdate();
            }
            winner.commit();

            MvcResult result = loser.get(60, TimeUnit.SECONDS);
            pool.shutdown();
            assertEquals(200, result.getResponse().getStatus(), body(result));
        }
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
        assertEquals(1, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", subject));
        assertEquals(1, credentialRows(List.of(token)));
    }

    @Test
    void databaseErrorThatIsNotADuplicateIdentityIsNeverRetriedOrTurnedIntoALogin() throws Exception {
        // Longer than users.email (254): SQL Server rejects the insert with a truncation error, not a unique violation.
        String email = UUID.randomUUID() + "a".repeat(250) + "@example.test";
        String subject = "sub-" + UUID.randomUUID();
        String token = credential(subject, email, true);
        MockMvc mvc = mvc(proxied(context.getBean(UserRepository.class)));

        MvcResult result = post(mvc, token);

        assertEquals(500, result.getResponse().getStatus(), body(result));
        assertEquals("INTERNAL_ERROR", errorCode(result));
        assertFalse(body(result).contains("accessToken"));
        assertEquals(1, verifyCalls(List.of(token)), "a non-duplicate error must not trigger the retry");
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.users WHERE email = ?", email));
        assertEquals(0, scalar("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE subject = ?", subject));
        assertEquals(0, credentialRows(List.of(token)), "everything, including the credential use, was rolled back");
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

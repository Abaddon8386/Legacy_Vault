package com.legacyvault.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditLogRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/** Xác nhận lại mật khẩu: so BCrypt, đếm lần sai theo audit, khóa tạm khi vượt ngưỡng (D-API-32). */
class PasswordReauthServiceTest {

	private static final Long USER_ID = 7L;
	private static final Long VAULT_ID = 10L;
	private static final String PASSWORD = "MatKhau@123";

	private final UserRepository userRepository = mock(UserRepository.class);
	private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
	private final AuditLogRepository auditLogRepository = mock(AuditLogRepository.class);
	private final ReauthFailureRecorder recorder = mock(ReauthFailureRecorder.class);
	private final PasswordReauthService service = new PasswordReauthService(userRepository, encoder,
			auditLogRepository, recorder, 5, 15);

	private void user(String status) {
		User user = new User();
		ReflectionTestUtils.setField(user, "userId", USER_ID);
		ReflectionTestUtils.setField(user, "passwordHash", encoder.encode(PASSWORD));
		ReflectionTestUtils.setField(user, "status", status);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
	}

	private void failuresSoFar(long count) {
		when(auditLogRepository.countByActorUserIdAndActionAndOccurredAtAfter(eq(USER_ID),
				eq(AuditAction.REAUTH_FAILED.name()), any(LocalDateTime.class))).thenReturn(count);
	}

	private static ErrorCode codeOf(Throwable ex) {
		return ((BusinessException) ex).getErrorCode();
	}

	@Test
	void correctPassword_passesAndRecordsNothing() {
		user("ACTIVE");
		failuresSoFar(0);

		service.requirePassword(USER_ID, VAULT_ID, PASSWORD);

		verifyNoInteractions(recorder);
	}

	@Test
	void wrongPassword_isRecordedAndRejectedWithReauthFailed() {
		user("ACTIVE");
		failuresSoFar(2);

		assertThatThrownBy(() -> service.requirePassword(USER_ID, VAULT_ID, "sai-mat-khau"))
				.satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.REAUTH_FAILED));
		verify(recorder).record(USER_ID, VAULT_ID);
	}

	@Test
	void atLimit_isLocked_evenWithCorrectPassword_andPasswordIsNotCompared() {
		PasswordEncoder spyEncoder = mock(PasswordEncoder.class);
		PasswordReauthService locked = new PasswordReauthService(userRepository, spyEncoder, auditLogRepository,
				recorder, 5, 15);
		user("ACTIVE");
		failuresSoFar(5);

		assertThatThrownBy(() -> locked.requirePassword(USER_ID, VAULT_ID, PASSWORD))
				.satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.TOO_MANY_ATTEMPTS));
		verify(spyEncoder, never()).matches(anyString(), anyString());
		verifyNoInteractions(recorder);
	}

	@Test
	void justBelowLimit_stillAllowsTheCorrectPassword() {
		user("ACTIVE");
		failuresSoFar(4);

		service.requirePassword(USER_ID, VAULT_ID, PASSWORD);
	}

	@Test
	void failuresAreCountedOnlyInsideTheConfiguredWindow() {
		user("ACTIVE");
		failuresSoFar(0);

		service.requirePassword(USER_ID, VAULT_ID, PASSWORD);

		ArgumentCaptor<LocalDateTime> since = ArgumentCaptor.forClass(LocalDateTime.class);
		verify(auditLogRepository).countByActorUserIdAndActionAndOccurredAtAfter(eq(USER_ID),
				eq(AuditAction.REAUTH_FAILED.name()), since.capture());
		LocalDateTime expected = LocalDateTime.now(ZoneOffset.UTC).minusMinutes(15);
		assertThat(since.getValue()).isBetween(expected.minusSeconds(10), expected.plusSeconds(10));
	}

	@Test
	void inactiveOrMissingUser_isUnauthenticated() {
		user("LOCKED");
		assertThatThrownBy(() -> service.requirePassword(USER_ID, VAULT_ID, PASSWORD))
				.satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));

		when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());
		assertThatThrownBy(() -> service.requirePassword(USER_ID, VAULT_ID, PASSWORD))
				.satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
	}

	@Test
	void nullPassword_isTreatedAsWrong() {
		user("ACTIVE");
		failuresSoFar(0);

		assertThatThrownBy(() -> service.requirePassword(USER_ID, VAULT_ID, null))
				.satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.REAUTH_FAILED));
	}

	@Test
	void invalidConfiguration_isRejectedAtStartup() {
		assertThatThrownBy(
				() -> new PasswordReauthService(userRepository, encoder, auditLogRepository, recorder, 0, 15))
				.isInstanceOf(IllegalArgumentException.class);
	}
}

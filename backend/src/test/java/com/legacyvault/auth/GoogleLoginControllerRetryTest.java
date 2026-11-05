package com.legacyvault.auth;

import com.legacyvault.auth.dto.GoogleLoginRequest;
import com.legacyvault.auth.dto.LoginResponse;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** A lost sign-up race is retried once by the controller; real conflicts are never retried. */
class GoogleLoginControllerRetryTest {
    private final GoogleAuthService google = mock(GoogleAuthService.class);
    private final AuthController controller = new AuthController(mock(AuthService.class), google);
    private final GoogleLoginRequest request = new GoogleLoginRequest("synthetic.credential");
    private final LoginResponse response = new LoginResponse("jwt", "Bearer", 3600,
            new LoginResponse.AuthUserResponse(UUID.randomUUID(), "G User", "g@example.test", List.of("VAULT_OWNER")));

    @Test
    void lostRaceIsRetriedOnceAndSignsTheSameGoogleUserIn() {
        when(google.login(request)).thenThrow(new GoogleSignupRaceException()).thenReturn(response);

        assertSame(response, controller.googleLogin(request).getBody());
        verify(google, times(2)).login(request);
    }

    @Test
    void secondLostRacePropagatesInsteadOfLoopingForever() {
        when(google.login(request)).thenThrow(new GoogleSignupRaceException());

        BusinessException exception = assertThrows(BusinessException.class, () -> controller.googleLogin(request));

        assertEquals(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED, exception.getErrorCode());
        verify(google, times(2)).login(request);
    }

    @Test
    void genuineExistingEmailConflictIsNotRetried() {
        when(google.login(request)).thenThrow(new BusinessException(ErrorCode.GOOGLE_EMAIL_ALREADY_REGISTERED));

        assertThrows(BusinessException.class, () -> controller.googleLogin(request));
        verify(google, times(1)).login(request);
    }
}

package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

class InvitationRedeemServiceTest {
    private final UserRepository users = Mockito.mock(UserRepository.class);
    private final BeneficiaryInvitationService invitations = Mockito.mock(BeneficiaryInvitationService.class);
    private final InvitationTokens tokens = new InvitationTokens();
    private final InvitationRedeemAttemptLimiter limiter = Mockito.mock(InvitationRedeemAttemptLimiter.class);
    private final InvitationRedeemFailureRecorder failures = Mockito.mock(InvitationRedeemFailureRecorder.class);
    private final InvitationRedeemService service = new InvitationRedeemService(users, invitations, tokens, limiter, failures);
    private final User account = new User();
    private static final Long ACCOUNT_ID = 41L;
    private static final String CODE = "AbCdEfGhIjKlMnOpQrStVw";

    @BeforeEach
    void setUp() {
        account.setStatus("ACTIVE");
        account.setEmailVerifiedAt(LocalDateTime.of(2026, 10, 21, 0, 0));
        when(users.findActiveAccountForUpdate(ACCOUNT_ID)).thenReturn(Optional.of(account));
    }

    @Test
    void successfulRedeemUsesAuthenticatedAccountAndBothRateLimitBuckets() {
        InvitationDtos.Linked linked = new InvitationDtos.Linked(UUID.randomUUID(), UUID.randomUUID(), "LINKED");
        when(invitations.redeemBoundAccount(CODE, ACCOUNT_ID)).thenReturn(linked);

        assertEquals(linked, service.redeem(ACCOUNT_ID, CODE));

        verify(limiter).requireAllowed(ACCOUNT_ID, tokens.hash(CODE));
        verify(invitations).redeemBoundAccount(CODE, ACCOUNT_ID);
        verify(failures, never()).record(Mockito.any(), Mockito.any());
    }

    @Test
    void invalidCredentialIsRecordedOutsideRedeemTransaction() {
        when(invitations.redeemBoundAccount(CODE, ACCOUNT_ID))
                .thenThrow(new BusinessException(ErrorCode.BENEFICIARY_INVITATION_INVALID));

        BusinessException error = assertThrows(BusinessException.class, () -> service.redeem(ACCOUNT_ID, CODE));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_INVALID, error.getErrorCode());
        verify(failures).record(ACCOUNT_ID, tokens.hash(CODE));
    }

    @Test
    void unverifiedAccountCannotRedeemAndDoesNotProbeInvitation() {
        account.setEmailVerifiedAt(null);

        BusinessException error = assertThrows(BusinessException.class, () -> service.redeem(ACCOUNT_ID, CODE));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED, error.getErrorCode());
        verify(limiter, never()).requireAllowed(eq(ACCOUNT_ID), Mockito.any());
        verify(invitations, never()).redeemBoundAccount(Mockito.any(), Mockito.any());
    }

    @Test
    void malformedCodesStillConsumeAccountBucketWithoutCreatingAnInvitationBucket() {
        String malformed = "not-a-code";
        when(invitations.redeemBoundAccount(malformed, ACCOUNT_ID))
                .thenThrow(new BusinessException(ErrorCode.BENEFICIARY_INVITATION_INVALID));

        assertThrows(BusinessException.class, () -> service.redeem(ACCOUNT_ID, malformed));

        verify(limiter).requireAllowed(ACCOUNT_ID, null);
        verify(failures).record(ACCOUNT_ID, null);
    }

    @Test
    void redeemRequestToStringRedactsTheCode() {
        assertEquals("RedeemRequest[code=<redacted>]", new InvitationDtos.RedeemRequest(CODE).toString());
    }
}

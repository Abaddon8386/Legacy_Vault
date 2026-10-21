package com.legacyvault.beneficiary;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/** Authenticated PS-87 orchestration. The account-row lock is the cross-instance limiter mutex and
 * also establishes the PS-86 User -> Vault lock order. */
@Service
public class InvitationRedeemService {
    private final UserRepository users;
    private final BeneficiaryInvitationService invitations;
    private final InvitationTokens tokens;
    private final InvitationRedeemAttemptLimiter limiter;
    private final InvitationRedeemFailureRecorder failures;

    public InvitationRedeemService(UserRepository users, BeneficiaryInvitationService invitations,
            InvitationTokens tokens, InvitationRedeemAttemptLimiter limiter,
            InvitationRedeemFailureRecorder failures) {
        this.users = users;
        this.invitations = invitations;
        this.tokens = tokens;
        this.limiter = limiter;
        this.failures = failures;
    }

    @Transactional
    public InvitationDtos.Linked redeem(Long authenticatedAccountId, String code) {
        User account = users.findActiveAccountForUpdate(authenticatedAccountId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BENEFICIARY_INVITATION_INVALID));

        String codeHash = tokens.validFormat(code) ? tokens.hash(code) : null;
        limiter.requireAllowed(authenticatedAccountId, codeHash);
        try {
            return invitations.redeemBoundAccount(code, authenticatedAccountId);
        }
        catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.BENEFICIARY_INVITATION_INVALID) {
                failures.record(authenticatedAccountId, codeHash);
            }
            throw ex;
        }
    }
}

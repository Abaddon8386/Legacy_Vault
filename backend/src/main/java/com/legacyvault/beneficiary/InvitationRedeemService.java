package com.legacyvault.beneficiary;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;

/** Điều phối PS-87 cho tài khoản đã xác thực. Khóa dòng tài khoản là mutex của limiter giữa các instance
 * và cũng thiết lập thứ tự khóa User -> Vault của PS-86. */
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

    /**
     * Đổi mã mời cho tài khoản đã xác thực.
     * Xử lý: khóa dòng User (mutex cho limiter và đúng thứ tự User -> Vault) -> kiểm tra giới hạn thử -> redeemBoundAccount.
     * Chỉ lỗi INVALID mới bị tính vào số lần thất bại.
     * @param code mã mời thô do người dùng nhập
     * @return kết quả liên kết
     */
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
                // Ghi nhận thất bại ở transaction riêng để không bị rollback cùng lỗi được ném ra.
                failures.record(authenticatedAccountId, codeHash);
            }
            throw ex;
        }
    }
}

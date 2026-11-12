
package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalDeathDecisionRequest;
import com.legacyvault.verification.dto.LegalDeathDecisionResponse;
import com.legacyvault.verification.dto.LegalDeathDocumentDetailResponse;
import com.legacyvault.verification.entity.DeathDocumentRecord;
import com.legacyvault.verification.entity.LegalVerification;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.DeathDocumentRecordRepository;
import com.legacyvault.verification.repository.LegalVerificationRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Legal Verifier thẩm định giấy tờ chứng tử mà Staff đã tiếp nhận (ST-12, LV-DEATH-002).
 *
 * <p>Được {@code LegalDeathVerificationController} gọi, base path {@code /api/v1/legal-verifications/death-documents}
 * (vai trò LEGAL_VERIFIER): {@code POST /{deathDocumentPublicId}/decision} (body {@link LegalDeathDecisionRequest},
 * trả {@link LegalDeathDecisionResponse}) và {@code GET /{deathDocumentPublicId}} (trả
 * {@link LegalDeathDocumentDetailResponse}). Bảng: {@code death_document_records}, {@code legal_verifications},
 * {@code verification_cases}, {@code vaults}, {@code users}. Ghi audit {@code LEGAL_DEATH_DOCUMENT_DECIDED} và gửi thông
 * báo workflow cho Staff.
 */
@Service
public class LegalDeathVerificationService {
    /**
     * Dịch vụ ghi thông báo workflow gửi Staff khi Legal ra quyết định.
     */
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * Loại thực thể ghi trong audit.
     */
    private static final String ENTITY_TYPE = "LEGAL_VERIFICATION";
    /**
     * Mã bước quy trình ghi vào audit.
     */
    private static final String STEP_ID = "ST-12";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    private static final String RULE_ID = "LV-DEATH-002";
    /**
     * Độ dài tối đa của lý do quyết định (ký tự).
     */
    private static final int MAX_REASON_LENGTH = 1000;

    private final DeathDocumentRecordRepository deathDocumentRecordRepository;
    private final LegalVerificationRepository legalVerificationRepository;
    private final VerificationCaseRepository verificationCaseRepository;
    private final VaultRepository vaultRepository;
    private final AuditService auditService;
    private final UserRepository userRepository;
    /**
     * Đồng hồ UTC dùng để lấy thời điểm quyết định.
     */
    private final Clock clock;

    /**
     * @param deathDocumentRecordRepository repository bản ghi giấy chứng tử
     * @param legalVerificationRepository repository các lần thẩm định của Legal
     * @param verificationCaseRepository repository hồ sơ xác minh
     * @param vaultRepository repository Vault
     * @param auditService dịch vụ ghi nhật ký kiểm toán
     * @param userRepository repository người dùng (đổi id nội bộ sang public id)
     * @param notifications dịch vụ thông báo workflow
     */
    public LegalDeathVerificationService(
            DeathDocumentRecordRepository deathDocumentRecordRepository,
            LegalVerificationRepository legalVerificationRepository,
            VerificationCaseRepository verificationCaseRepository,
            VaultRepository vaultRepository,
            AuditService auditService,
            UserRepository userRepository
    , com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.notifications = notifications;
        this.deathDocumentRecordRepository = deathDocumentRecordRepository;
        this.legalVerificationRepository = legalVerificationRepository;
        this.verificationCaseRepository = verificationCaseRepository;
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
        this.userRepository = userRepository;
        this.clock = Clock.systemUTC();
    }

    /**
     * Ghi quyết định thẩm định giấy tờ chứng tử theo LV-DEATH-002.
     * API: {@code POST /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}/decision}.
     *
     * <p>Các bước: kiểm tra request (decision và lý do không rỗng, tối đa 1000 ký tự); khóa theo thứ tự Vault -> case ->
     * bản ghi chứng tử; kiểm tra lại quan hệ sau khi khóa; yêu cầu case mở và Vault ở AWAITING_VERIFICATION; từ chối nếu bản
     * ghi đã có quyết định; ánh xạ APPROVE/REJECT/REQUEST_MORE sang kết quả lưu DB; lưu {@code LegalVerification}; nếu APPROVE
     * thì chuyển Vault sang bước thẩm định giấy tờ; ghi audit {@code LEGAL_DEATH_DOCUMENT_DECIDED} (không chứa nguyên văn lý
     * do); gửi thông báo cho Staff.
     *
     * @param deathDocumentPublicId UUID công khai của giấy tờ chứng tử
     * @param request quyết định và lý do của Legal Verifier
     * @param principal người dùng hiện tại do Spring Security cung cấp
     * @return quyết định đã lưu cùng trạng thái case và Vault
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND},
     *         {@code LEGAL_VERIFICATION_INVALID_STATE} khi case đóng, Vault sai trạng thái hoặc dữ liệu lệch,
     *         {@code LEGAL_VERIFICATION_ALREADY_DECIDED} khi đã có quyết định
     */
    @Transactional
    public LegalDeathDecisionResponse decide(
            UUID deathDocumentPublicId,
            LegalDeathDecisionRequest request,
            CustomUserPrincipal principal
    ) {
        Long actorUserId = CustomUserPrincipal.requireUserId(principal);

        validateRequest(request);

        DeathDocumentRecord initialDeathRecord = deathDocumentRecordRepository
                .findByPublicId(deathDocumentPublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase initialCase = verificationCaseRepository
                .findById(initialDeathRecord.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        // Thứ tự khóa thống nhất: Vault -> VerificationCase -> DeathDocumentRecord.
        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase verificationCase = verificationCaseRepository
                .findByIdForUpdate(initialDeathRecord.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        DeathDocumentRecord deathRecord = deathDocumentRecordRepository
                .findByPublicIdForUpdate(deathDocumentPublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        // Xác minh lại quan hệ sau khi đã khóa dữ liệu.
        if (!Objects.equals(
                verificationCase.getVaultId(),
                vault.getVaultId())
                || !Objects.equals(
                deathRecord.getVerificationCaseId(),
                verificationCase.getVerificationCaseId())) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        if (!Vault.STATUS_AWAITING_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        if (legalVerificationRepository.existsByDeathDocumentRecordId(
                deathRecord.getDeathDocumentRecordId())) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_ALREADY_DECIDED);
        }

        String result = mapDecision(request.decision());
        String vaultStatusBefore = vault.getStatus();

        LocalDateTime nowUtc = LocalDateTime.ofInstant(
                clock.instant(),
                ZoneOffset.UTC
        );

        LegalVerification verification = LegalVerification.createDeathDecision(
                deathRecord.getDeathDocumentRecordId(),
                actorUserId,
                result,
                request.reason().trim(),
                nowUtc
        );

        verification = legalVerificationRepository.saveAndFlush(verification);

        if (request.decision()
                == LegalDeathDecisionRequest.Decision.APPROVE) {
            vault.markDocumentVerification();
        }

        String vaultStatusAfter = vault.getStatus();

        // Audit cùng transaction; không ghi nguyên văn reason vào metadata.
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_DEATH_DOCUMENT_DECIDED,
                AuditActorType.USER,
                actorUserId,
                verificationCase.getVaultId(),
                ENTITY_TYPE,
                verification.getVerificationId(),
                LegalVerification.RESULT_PENDING,
                result,
                null,
                Map.of(
                        "decision", result,
                        "deathDocumentPublicId",
                        deathRecord.getPublicId().toString(),
                        "verificationCasePublicId",
                        verificationCase.getPublicId().toString(),
                        "vaultStatusBefore", vaultStatusBefore,
                        "vaultStatusAfter", vaultStatusAfter
                ),
                STEP_ID,
                RULE_ID
        ));

        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF, "LEGAL_DEATH_DOCUMENT_DECIDED", "death-decision:" + deathRecord.getPublicId(), request.reason().trim());
        return new LegalDeathDecisionResponse(
                deathRecord.getPublicId(),
                verificationCase.getPublicId(),
                verification.getResult(),
                principal.publicId(),
                toUtcInstant(verification.getDecidedAt()),
                verification.getRemarks(),
                verificationCase.getStatus(),
                vaultStatusAfter
        ).withNotification(notification);
    }

    /**
     * Đọc chi tiết hồ sơ chứng tử và lịch sử thẩm định.
     * API: {@code GET /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}}. Giao dịch chỉ đọc.
     *
     * @param deathDocumentPublicId UUID công khai của giấy tờ chứng tử
     * @return metadata, trạng thái và lịch sử quyết định (mới nhất trước)
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
    @Transactional(readOnly = true)
    public LegalDeathDocumentDetailResponse getDetail(
            UUID deathDocumentPublicId
    ) {
        DeathDocumentRecord deathRecord = deathDocumentRecordRepository
                .findByPublicId(deathDocumentPublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase verificationCase = verificationCaseRepository
                .findById(deathRecord.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Vault vault = vaultRepository
                .findById(verificationCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        UUID receivedByPublicId = findUserPublicId(
                deathRecord.getReceivedByUserId());

        List<LegalDeathDocumentDetailResponse.DecisionHistory> decisions =
                legalVerificationRepository
                        .findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
                                deathRecord.getDeathDocumentRecordId())
                        .stream()
                        .map(verification -> {
                            UUID verifierPublicId =
                                    verification.getVerifierUserId() == null
                                            ? null
                                            : findUserPublicId(
                                            verification.getVerifierUserId());

                            return new LegalDeathDocumentDetailResponse.DecisionHistory(
                                    verification.getResult(),
                                    verifierPublicId,
                                    toUtcInstant(verification.getRequestedAt()),
                                    toUtcInstant(verification.getDecidedAt()),
                                    verification.getRemarks()
                            );
                        })
                        .toList();

        LegalDeathDocumentDetailResponse.DocumentMetadata metadata =
                new LegalDeathDocumentDetailResponse.DocumentMetadata(
                        deathRecord.getDocumentType(),
                        deathRecord.getIssuingAuthority(),
                        deathRecord.getDocumentNumber(),
                        deathRecord.getIssuedDate(),
                        receivedByPublicId,
                        toUtcInstant(deathRecord.getReceivedAt()),
                        deathRecord.getEvidenceReference(),
                        deathRecord.getNotes(),
                        toUtcInstant(deathRecord.getCreatedAt())
                );

        return new LegalDeathDocumentDetailResponse(
                deathRecord.getPublicId(),
                verificationCase.getPublicId(),
                verificationCase.getStatus(),
                vault.getStatus(),
                metadata,
                decisions
        );
    }

    /**
     * Lấy public UUID của user từ khóa nội bộ.
     *
     * @param userId id nội bộ của người dùng
     * @return public id
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu không có người dùng
     */
    private UUID findUserPublicId(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        return user.getPublicId();
    }

    /**
     * Chuyển LocalDateTime được lưu theo quy ước UTC thành Instant; trả {@code null} nếu đầu vào null.
     */
    private Instant toUtcInstant(LocalDateTime value) {
        return value == null
                ? null
                : value.toInstant(ZoneOffset.UTC);
    }

    /**
     * Kiểm tra dữ liệu đầu vào ở tầng service: request, decision và reason không null, reason sau trim không rỗng và
     * không quá 1000 ký tự.
     *
     * @throws BusinessException {@code VALIDATION_FAILED}
     */
    private void validateRequest(LegalDeathDecisionRequest request) {
        if (request == null
                || request.decision() == null
                || request.reason() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        String reason = request.reason().trim();

        if (reason.isBlank() || reason.length() > MAX_REASON_LENGTH) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    /**
     * Chuyển enum API sang kết quả lưu trong database: APPROVE thành APPROVED, REJECT thành REJECTED, REQUEST_MORE thành
     * NEEDS_CORRECTION.
     */
    private String mapDecision(
            LegalDeathDecisionRequest.Decision decision
    ) {
        return switch (decision) {
            case APPROVE -> LegalVerification.RESULT_APPROVED;
            case REJECT -> LegalVerification.RESULT_REJECTED;
            case REQUEST_MORE -> LegalVerification.RESULT_NEEDS_CORRECTION;
        };
    }
}

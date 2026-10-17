
package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class LegalDeathVerificationService {

    private static final String ENTITY_TYPE = "LEGAL_VERIFICATION";
    private static final String STEP_ID = "ST-12";
    private static final String RULE_ID = "LV-DEATH-002";
    private static final int MAX_REASON_LENGTH = 1000;

    private final DeathDocumentRecordRepository deathDocumentRecordRepository;
    private final LegalVerificationRepository legalVerificationRepository;
    private final VerificationCaseRepository verificationCaseRepository;
    private final VaultRepository vaultRepository;
    private final AuditService auditService;
    private final Clock clock;

    public LegalDeathVerificationService(
            DeathDocumentRecordRepository deathDocumentRecordRepository,
            LegalVerificationRepository legalVerificationRepository,
            VerificationCaseRepository verificationCaseRepository,
            VaultRepository vaultRepository,
            AuditService auditService
    ) {
        this.deathDocumentRecordRepository = deathDocumentRecordRepository;
        this.legalVerificationRepository = legalVerificationRepository;
        this.verificationCaseRepository = verificationCaseRepository;
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
        this.clock = Clock.systemUTC();
    }

    /**
     * Ghi quyết định thẩm định giấy tờ chứng tử theo LV-DEATH-002.
     *
     * Package: com.legacyvault.verification.service
     * Class: LegalDeathVerificationService
     * Vị trí: phương thức công khai decide().
     *
     * @param deathDocumentPublicId UUID công khai của giấy tờ chứng tử
     * @param request quyết định và lý do của Legal Verifier
     * @param principal người dùng hiện tại do Spring Security cung cấp
     * @return quyết định đã lưu cùng trạng thái case và Vault
     */
    @Transactional
    public LegalDeathDecisionResponse decide(
            UUID deathDocumentPublicId,
            LegalDeathDecisionRequest request,
            CustomUserPrincipal principal
    ) {
        Long actorUserId = CustomUserPrincipal.requireUserId(principal);

        validateRequest(request);

        // Đọc không khóa để xác định VerificationCase và Vault cần khóa.
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

        // Chỉ xử lý case đang mở.
        if (!verificationCase.isOpen()) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        // Dead Man's Switch không thay thế quyết định thẩm định pháp lý.
        if (!Vault.STATUS_AWAITING_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        // Mỗi hồ sơ chứng tử chỉ có một quyết định.
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

        // Persist decision, actor, time và reason trong LegalVerification.
        LegalVerification verification = LegalVerification.createDeathDecision(
                deathRecord.getDeathDocumentRecordId(),
                actorUserId,
                result,
                request.reason().trim(),
                nowUtc
        );

        verification = legalVerificationRepository.saveAndFlush(verification);

        // Chỉ APPROVE mới chuyển Vault theo logic hiện tại.
        if (request.decision()
                == LegalDeathDecisionRequest.Decision.APPROVE) {
            vault.markDocumentVerification();
        }

        String vaultStatusAfter = vault.getStatus();

        // Audit nằm trong cùng transaction.
        // Không ghi nguyên văn reason vào metadata audit.
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

        return new LegalDeathDecisionResponse(
                deathRecord.getPublicId(),
                verificationCase.getPublicId(),
                verification.getVerificationId(),
                verification.getResult(),
                principal.publicId(),
                verification.getDecidedAt(),
                verification.getRemarks(),
                verificationCase.getStatus(),
                vaultStatusAfter
        );
    }

    /**
     * Kiểm tra dữ liệu đầu vào ở tầng service.
     *
     * Package: com.legacyvault.verification.service
     * Class: LegalDeathVerificationService
     * Vị trí: phương thức private ngay dưới decide().
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
     * Chuyển enum API sang result lưu trong database.
     *
     * Package: com.legacyvault.verification.service
     * Class: LegalDeathVerificationService
     * Vị trí: phương thức private ngay dưới validateRequest().
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


    /**
     * Đọc chi tiết hồ sơ chứng tử và lịch sử thẩm định.
     *
     * Package: com.legacyvault.verification.service
     * Class: LegalDeathVerificationService
     * Vị trí: ngay sau decide(), trước validateRequest().
     */
    @Transactional(readOnly = true)
    public LegalDeathDocumentDetailResponse getDetail(UUID deathDocumentPublicId) {
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

        List<LegalDeathDocumentDetailResponse.DecisionHistory> decisions =
                legalVerificationRepository
                        .findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
                                deathRecord.getDeathDocumentRecordId())
                        .stream()
                        .map(verification -> new LegalDeathDocumentDetailResponse.DecisionHistory(
                                verification.getVerificationId(),
                                verification.getResult(),
                                verification.getVerifierUserId(),
                                verification.getRequestedAt(),
                                verification.getDecidedAt(),
                                verification.getRemarks()
                        ))
                        .toList();

        LegalDeathDocumentDetailResponse.DocumentMetadata metadata =
                new LegalDeathDocumentDetailResponse.DocumentMetadata(
                        deathRecord.getDocumentType(),
                        deathRecord.getIssuingAuthority(),
                        deathRecord.getDocumentNumber(),
                        deathRecord.getIssuedDate(),
                        deathRecord.getReceivedByUserId(),
                        deathRecord.getReceivedAt(),
                        deathRecord.getEvidenceReference(),
                        deathRecord.getNotes(),
                        deathRecord.getCreatedAt()
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

}

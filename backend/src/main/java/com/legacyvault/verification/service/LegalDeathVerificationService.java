package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalDeathDecisionRequest;
import com.legacyvault.verification.dto.LegalDeathDecisionResponse;
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
import java.util.Map;
import java.util.UUID;

@Service
public class LegalDeathVerificationService {

    private static final String ENTITY_TYPE = "LEGAL_VERIFICATION";
    private static final String STEP_ID = "ST-12";
    private static final String RULE_ID = "LV-DEATH-002";

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
     * Ghi quyết định thẩm định giấy tờ chứng tử theo ST-12.
     *
     * Vị trí: class LegalDeathVerificationService,
     * package com.legacyvault.verification.service.
     *
     * @param deathDocumentPublicId UUID công khai của giấy tờ chứng tử
     * @param request quyết định và lý do của Legal Verifier
     * @param principal principal do Spring Security cung cấp
     * @return quyết định đã lưu cùng trạng thái case và Vault
     */
    @Transactional
    public LegalDeathDecisionResponse decide(
            UUID deathDocumentPublicId,
            LegalDeathDecisionRequest request,
            CustomUserPrincipal principal
    ) {
        Long actorUserId = CustomUserPrincipal.requireUserId(principal);

        if (request == null || request.decision() == null
                || request.reason() == null || request.reason().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        DeathDocumentRecord deathRecord = deathDocumentRecordRepository
                .findByPublicIdForUpdate(deathDocumentPublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase verificationCase = verificationCaseRepository
                .findByIdForUpdate(deathRecord.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!verificationCase.isOpen()) {
            throw new BusinessException(
                    ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        Vault vault = vaultRepository.findByIdForUpdate(
                        verificationCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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
                clock.instant(), ZoneOffset.UTC);

        LegalVerification verification = LegalVerification.createDeathDecision(
                deathRecord.getDeathDocumentRecordId(),
                actorUserId,
                result,
                request.reason(),
                nowUtc
        );

        verification = legalVerificationRepository.saveAndFlush(verification);

        if (request.decision()
                == LegalDeathDecisionRequest.Decision.APPROVE) {
            vault.markDocumentVerification();
        }

        String vaultStatusAfter = vault.getStatus();

        // Ghi audit trong cùng transaction: lỗi audit phải rollback quyết định.
        // Không đưa số giấy tờ, nội dung file hay thông tin định danh vào audit.
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
                        "reason", request.reason().trim(),
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
     * Chuyển enum public API sang result được SQL Server hỗ trợ.
     *
     * Vị trí: class LegalDeathVerificationService,
     * ngay dưới phương thức decide().
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
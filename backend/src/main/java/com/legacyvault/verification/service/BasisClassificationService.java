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
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-102: COURT-only writes; optional will comparison never substitutes court validation.
 * Legacy NOTARIAL records remain readable without automatic conversion. Lock Vault -> Case -> Dossier.
 *
 * <p>PS-102 / ST-16 (LV-BASIS-001): Legal phân loại căn cứ pháp lý của một ca xác minh (COURT, NOTARIAL hoặc ON_HOLD)
 * và mở hồ sơ căn cứ ({@code legal_basis_dossiers}) cho ca đó.
 *
 * Được gọi bởi {@code LegalBasisDossierController} qua
 * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier} (vai trò {@code LEGAL_VERIFIER}),
 * body {@link ClassifyBasisRequest}, trả {@link BasisDossierResponse}.
 * Thứ tự khóa bắt buộc: Vault → VerificationCase → Dossier. Ghi audit {@code LEGAL_BASIS_CLASSIFIED}.
 */
@Service
public class BasisClassificationService {

    /**
     * Loại thực thể ghi vào audit log.
     */
    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    /**
     * Mã bước quy trình ghi vào audit (ST-16: phân loại căn cứ).
     */
    static final String STEP_ID = "ST-16";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    static final String RULE_ID = "LV-BASIS-001";

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final WillComparisonService willComparisons;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisLockedState lockedState;

    /**
     * Khởi tạo service với các repository tra cứu/khóa ca, Vault, hồ sơ căn cứ và các thành phần phụ trợ (audit, view, trạng thái đã khóa).
     */
    public BasisClassificationService(LegalCaseLookupRepository caseLookup, VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository, LegalBasisDossierRepository dossiers, WillComparisonService willComparisons,
            BasisDossierViewService views, AuditService auditService, LegalBasisLockedState lockedState) {
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.willComparisons = willComparisons;
        this.views = views;
        this.auditService = auditService;
        this.lockedState = lockedState;
    }

    /**
     * Phân loại căn cứ pháp lý cho ca và tạo hồ sơ căn cứ mới.
     *
     * Các bước: (1) kiểm tra request ({@link #validate}); (2) tìm ca theo UUID công khai; (3) khóa Vault rồi ca bằng
     * {@code findByIdForUpdate}; (4) kiểm tra ca còn mở, Vault ở trạng thái WILL_VERIFICATION hoặc DOCUMENT_VERIFICATION
     * và chưa có hồ sơ căn cứ; (5) lưu {@link LegalBasisDossier} với nhánh, lý do và trạng thái tranh chấp;
     * (6) chuyển trạng thái Vault qua {@code markLegalBasisRouted(onHold)}; (7) ghi audit {@code LEGAL_BASIS_CLASSIFIED}
     * (không ghi lý do phân loại); (8) trả hồ sơ qua {@link BasisDossierViewService#view}.
     *
     * @param caseId UUID công khai của ca xác minh
     * @param principal Legal đang đăng nhập
     * @param request nhánh ({@code COURT}/{@code NOTARIAL}/{@code ON_HOLD}) và lý do (tối đa 1000 ký tự)
     * @return hồ sơ căn cứ vừa tạo (kèm lý do vì người xem là Legal)
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED (request sai), RESOURCE_NOT_FOUND,
     *         BASIS_DOSSIER_INVALID_STATE (ca đóng hoặc Vault sai trạng thái), BASIS_DOSSIER_ALREADY_EXISTS
     */
    @Transactional
    public BasisDossierResponse classify(UUID caseId, CustomUserPrincipal principal, ClassifyBasisRequest request) {
        Long legalUserId = CustomUserPrincipal.requireUserId(principal);
        String reason = validate(request);

        VerificationCase initialCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);
        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId()) || !verificationCase.isOpen()
                || !(Vault.STATUS_WILL_VERIFICATION.equals(vault.getStatus())
                || Vault.STATUS_DOCUMENT_VERIFICATION.equals(vault.getStatus()))) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        if (dossiers.findByVerificationCaseId(verificationCase.getVerificationCaseId()).isPresent()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_ALREADY_EXISTS);
        }
        // COURT evidence, not a will MATCH, controls distribution (PS-102).

        String route = request.route().name();
        boolean onHold = request.route() == ClassifyBasisRequest.Route.ON_HOLD;
        LegalBasisDossier dossier = dossiers.saveAndFlush(new LegalBasisDossier(
                verificationCase.getVerificationCaseId(), route, reason, disputeStatusOf(request.route()),
                legalUserId));

        String vaultStatusBefore = vault.getStatus();
        vault.markLegalBasisRouted(onHold);

        // Audit không ghi lý do phân loại (có thể chứa thông tin tranh chấp); trạng thái Vault đi qua states.
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_CLASSIFIED,
                AuditActorType.USER,
                legalUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                vaultStatusBefore,
                vault.getStatus(),
                null,
                Map.of(
                        "route", route,
                        "disputeStatus", dossier.getDisputeStatus(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "dossierId", dossier.getPublicId().toString()
                ),
                STEP_ID,
                RULE_ID
        ));

        return views.view(verificationCase, true);
    }

    /**
     * Suy ra trạng thái tranh chấp từ nhánh phân loại: NOTARIAL → không tranh chấp, COURT → có tranh chấp,
     * ON_HOLD → chưa xác định. Cũng được {@link BasisReclassificationService} dùng lại.
     *
     * @param route nhánh được chọn
     * @return hằng {@code DISPUTE_*} của {@link LegalBasisDossier}
     */
    static String disputeStatusOf(ClassifyBasisRequest.Route route) {
        return switch (route) {
            case NOTARIAL -> LegalBasisDossier.DISPUTE_NONE;
            case COURT -> LegalBasisDossier.DISPUTE_DISPUTED;
            case ON_HOLD -> LegalBasisDossier.DISPUTE_UNDETERMINED;
        };
    }

    /**
     * Kiểm tra request: bắt buộc có nhánh và lý do, lý do sau khi trim không rỗng và không quá 1000 ký tự.
     *
     * @param request body từ client
     * @return lý do đã trim
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED nếu không hợp lệ
     */
    private static String validate(ClassifyBasisRequest request) {
        if (request == null || request.route() == null || request.routeReason() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String reason = request.routeReason().trim();
        if (reason.isEmpty() || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        return reason;
    }
}

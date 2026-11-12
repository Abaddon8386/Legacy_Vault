package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CreateHandoverReceiptRequest;
import com.legacyvault.verification.dto.HandoverReceiptResponse;
import com.legacyvault.verification.entity.HandoverReceipt;
import com.legacyvault.verification.entity.HandoverReceiptAsset;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.verification.repository.HandoverReceiptAssetRepository;
import com.legacyvault.verification.repository.HandoverReceiptRepository;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.LegalWorkflowGuard.ProtectedTransition;
import com.legacyvault.vault.entity.Vault;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * ST-28 (LV-LEG-001): Staff xác nhận và lập biên nhận bàn giao cho từng người nhận sau khi phiên đã hoàn tất.
 *
 * Được gọi bởi {@code HandoverReceiptController} (vai trò {@code STAFF_EXECUTOR}), tiền tố
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts}: {@code POST} → {@link #create}, {@code GET} → {@link #list}, {@code GET /{receiptId}} → {@link #get}.
 * Ghi bảng {@code handover_receipts} và {@code handover_receipt_assets}; audit {@code HANDOVER_RECEIPT_STAFF_CONFIRMED}.
 */
@Service
public class HandoverReceiptService {
private final com.legacyvault.verification.group.GroupHandoverService group;
    /**
     * Mã bước quy trình ghi vào audit (ST-28).
     */
    private static final String STEP_ID = "ST-28";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    private static final String RULE_ID = "LV-LEG-001";

    private final VerificationCaseRepository cases;
    private final HandoverSessionRepository sessions;
    private final HandoverReceiptRepository receipts;
    private final HandoverReceiptAssetRepository receiptAssets;
    private final LegalWorkflowGuard workflow;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final AuditService audit;
    private final com.legacyvault.verification.repository.HandoverCompletionEvidenceRepository evidence;

    /**
     * Khởi tạo với các repository (ca, phiên, biên nhận, tài sản biên nhận, phiên bản, phân bổ, bằng chứng), cổng quy trình, audit và bàn giao nhóm.
     */
    public HandoverReceiptService(VerificationCaseRepository cases, HandoverSessionRepository sessions,
            HandoverReceiptRepository receipts, HandoverReceiptAssetRepository receiptAssets,
            LegalWorkflowGuard workflow, LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations, AuditService audit,
            com.legacyvault.verification.repository.HandoverCompletionEvidenceRepository evidence, com.legacyvault.verification.group.GroupHandoverService group) {
this.group=group;
        this.cases = cases;
        this.sessions = sessions;
        this.receipts = receipts;
        this.receiptAssets = receiptAssets;
        this.workflow = workflow;
        this.versions = versions;
        this.allocations = allocations;
        this.audit = audit;
        this.evidence = evidence;
    }

    /**
     * Tạo biên nhận cho một người nhận.
     *
     * Các bước: kiểm tra request; khóa ca qua cổng HANDOVER; Staff phải phụ trách ca và Vault ở UNLOCKED/HANDOVER_IN_PROGRESS; phiên phải đã
     * COMPLETED và bàn giao nhóm sẵn sàng; bằng chứng đóng phiên phải khớp phiên bản/SHA-256/hash phạm vi hiện hành; người nhận phải có dòng
     * phân bổ và danh tính {@code VERIFIED_AT_COUNTER}; các tài sản chọn phải thuộc người đó và đã duyệt; nếu thay thế biên nhận cũ thì
     * biên nhận cũ phải hợp lệ và chưa bị thay thế; lưu biên nhận, tài sản biên nhận và ghi audit.
     *
     * @param casePublicId UUID công khai của ca
     * @param sessionPublicId UUID công khai của phiên
     * @param request người nhận, danh sách tài sản và biên nhận bị thay thế (tùy chọn)
     * @param principal Staff đang đăng nhập
     * @return biên nhận vừa tạo
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED, RESOURCE_NOT_FOUND, HANDOVER_RECEIPT_INVALID_STATE,
     *         HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED, HANDOVER_RECEIPT_RECIPIENT_NOT_VERIFIED, HANDOVER_RECEIPT_REISSUE_INVALID
     */
    @Transactional
    public HandoverReceiptResponse create(UUID casePublicId, UUID sessionPublicId,
            CreateHandoverReceiptRequest request, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.recipientId() == null || request.assetIds() == null
                || request.assetIds().isEmpty() || new HashSet<>(request.assetIds()).size() != request.assetIds().size()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        var initialCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        var locked = workflow.requireProtectedTransition(casePublicId, ProtectedTransition.HANDOVER);
        var verificationCase = locked.verificationCase();
        var dossier = locked.dossier();
        if (!verificationCase.getVerificationCaseId().equals(initialCase.getVerificationCaseId())
                || !staffId.equals(verificationCase.getAssignedStaffUserId())
                || !(Vault.STATUS_UNLOCKED.equals(locked.vault().getStatus())
                || Vault.STATUS_HANDOVER_IN_PROGRESS.equals(locked.vault().getStatus()))) {
            throw invalidState();
        }

        var session = sessions.findByPublicIdAndCaseAndStaffForUpdate(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        if (session.getStatus() != HandoverSessionStatus.COMPLETED) throw invalidState();
        group.requireReady(casePublicId,sessionPublicId,principal);
        var proof = evidence.findBySessionId(session.getId()).orElseThrow(HandoverReceiptService::invalidState);

        int currentVersionNo = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var currentVersion = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), currentVersionNo)
                .orElseThrow(HandoverReceiptService::invalidState);
        if (!java.util.Objects.equals(proof.getVersionId(), currentVersion.id())
                || !java.util.Objects.equals(proof.getSha256(), currentVersion.sha256())
                || !java.util.Objects.equals(proof.getScopeHash(), dossier.getLastReviewedAllocationHash()))
            throw invalidState();
        List<ReceiptAllocationRow> currentRows = allocations.findReceiptRowsByDossier(dossier.getLegalBasisDossierId())
                .stream().filter(row -> row.versionNo() == currentVersionNo).toList();
        if (currentRows.isEmpty()) throw new BusinessException(ErrorCode.HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED);

        Long beneficiaryDbId = currentRows.stream()
                .filter(row -> row.beneficiaryPublicId().equals(request.recipientId()))
                .map(ReceiptAllocationRow::beneficiaryId)
                .findFirst().orElseThrow(() -> new BusinessException(ErrorCode.HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED));
        boolean recipientVerified = currentRows.stream()
                .filter(row -> row.beneficiaryId().equals(beneficiaryDbId))
                .anyMatch(row -> Beneficiary.VERIFIED_AT_COUNTER.equals(row.beneficiaryIdentityVerificationStatus()));
        if (!recipientVerified) throw new BusinessException(ErrorCode.HANDOVER_RECEIPT_RECIPIENT_NOT_VERIFIED);
        Map<UUID, ReceiptAllocationRow> rowsByAsset = currentRows.stream()
                .filter(row -> row.beneficiaryId().equals(beneficiaryDbId)
                        && LegalBasisVersionAllocation.STATUS_APPROVED.equals(row.status()))
                .collect(java.util.stream.Collectors.toMap(ReceiptAllocationRow::assetPublicId, row -> row));
        List<ReceiptAllocationRow> selectedRows = request.assetIds().stream()
                .map(rowsByAsset::get)
                .toList();
        if (selectedRows.stream().anyMatch(java.util.Objects::isNull)) {
            throw new BusinessException(ErrorCode.HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED);
        }

        Long supersedesReceiptDbId = null;
        if (request.supersedesReceiptId() != null) {
            HandoverReceipt prior = receipts.findForReplacement(request.supersedesReceiptId(),
                            session.getId(), beneficiaryDbId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.HANDOVER_RECEIPT_REISSUE_INVALID));
            if (receipts.existsBySupersedesReceiptId(prior.getId())) {
                throw new BusinessException(ErrorCode.HANDOVER_RECEIPT_REISSUE_INVALID);
            }
            supersedesReceiptDbId = prior.getId();
        }

        String currentAllocationHash = AllocationScopeHash.hashReceiptRows(currentRows);
        LocalDateTime confirmedAt = LocalDateTime.now(ZoneOffset.UTC);
        HandoverReceipt receipt = receipts.saveAndFlush(new HandoverReceipt(
                session.getId(), beneficiaryDbId, staffId, currentVersion.id(), currentVersionNo,
                currentVersion.sha256(), currentAllocationHash, supersedesReceiptDbId, confirmedAt));
        receiptAssets.saveAllAndFlush(selectedRows.stream()
                .map(row -> new HandoverReceiptAsset(receipt.getId(), row.allocationId(), row.assetId()))
                .toList());

        audit.record(new AuditEvent(AuditAction.HANDOVER_RECEIPT_STAFF_CONFIRMED, AuditActorType.USER,
                staffId, locked.vault().getVaultId(), "HANDOVER_RECEIPT", receipt.getId(), null,
                HandoverReceipt.STAFF_ATTESTATION, null,
                Map.of("receiptPublicId", receipt.getPublicId().toString(),
                        "sessionPublicId", session.getPublicId().toString(),
                        "recipientPublicId", request.recipientId().toString(),
                        "assetCount", selectedRows.size(), "dossierVersionNo", currentVersionNo),
                STEP_ID, RULE_ID));
        return toResponse(receipt);
    }

    /**
     * Liệt kê biên nhận của một phiên (mới nhất trước); Staff phải phụ trách ca và phiên.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND
     */
    @Transactional(readOnly = true)
    public List<HandoverReceiptResponse> list(UUID casePublicId, UUID sessionPublicId,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        var session = sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        return receipts.findByHandoverSessionIdOrderByConfirmedAtDesc(session.getId()).stream()
                .map(this::toResponse).toList();
    }

    /**
     * Xem chi tiết một biên nhận của phiên.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND
     */
    @Transactional(readOnly = true)
    public HandoverReceiptResponse get(UUID casePublicId, UUID sessionPublicId, UUID receiptPublicId,
            CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        var session = sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(HandoverReceiptService::notFound);
        HandoverReceipt receipt = receipts.findByPublicIdAndHandoverSessionId(receiptPublicId, session.getId())
                .orElseThrow(HandoverReceiptService::notFound);
        return toResponse(receipt);
    }

    /**
     * Dựng response: tra phiên, UUID và tên người nhận, danh sách UUID tài sản, UUID Staff và biên nhận bị thay thế.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND nếu thiếu dữ liệu liên quan
     */
    private HandoverReceiptResponse toResponse(HandoverReceipt receipt) {
        var session = sessions.findById(receipt.getHandoverSessionId()).orElseThrow(HandoverReceiptService::notFound);
        UUID recipientPublicId = receipts.findRecipientPublicId(receipt.getId())
                .orElseThrow(HandoverReceiptService::notFound);
        String recipientName = receipts.findRecipientName(receipt.getId()).orElse(null);
        UUID supersedesPublicId = receipt.getSupersedesReceiptId() == null ? null
                : receipts.findById(receipt.getSupersedesReceiptId()).map(HandoverReceipt::getPublicId).orElse(null);
        return new HandoverReceiptResponse(receipt.getPublicId(), session.getPublicId(), recipientPublicId,
                recipientName,
                receiptAssets.findAssetPublicIds(receipt.getId()),
                receipts.findStaffPublicId(receipt.getId()).orElseThrow(HandoverReceiptService::notFound),
                receipt.getDossierVersionNo(), receipt.getSha256Hash(), receipt.getAllocationHash(),
                receipt.getConfirmationType(), receipt.getConfirmedAt(), supersedesPublicId);
    }

    /**
     * Tạo lỗi {@code HANDOVER_RECEIPT_INVALID_STATE}.
     */
    private static BusinessException invalidState() {
        return new BusinessException(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
    }


    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND}.
     */
    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}

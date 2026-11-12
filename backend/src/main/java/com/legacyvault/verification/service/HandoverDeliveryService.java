package com.legacyvault.verification.service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.EligibleHandoverAssetResponse;
import com.legacyvault.verification.dto.HandoverDeliveryRequest;
import com.legacyvault.verification.dto.HandoverItemResponse;
import com.legacyvault.verification.entity.HandoverItem;
import com.legacyvault.verification.repository.HandoverItemRepository;
import com.legacyvault.verification.repository.HandoverItemRow;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverAuthorizationGuard.Authorized;
import com.legacyvault.verification.service.HandoverScopeResolver.ScopeLine;

/**
 * PS-64 / PS-65 (ST-25, LV-HANDOVER-001): lists the assets Legal allows to be handed over and records each delivery
 * made by Staff at the counter. {@code eligibleAssets} and {@code deliver} pass {@link HandoverAuthorizationGuard} first, then work only on
 * the Legal-approved lines of the current dossier version. Deliveries are all-or-nothing, append-only and audited.
 * The first delivery moves the Vault UNLOCKED -> HANDOVER_IN_PROGRESS.
 *
 * <p>Bổ sung: được {@code HandoverDeliveryController} gọi (vai trò {@code STAFF_EXECUTOR}), tiền tố
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}}:
 * <ul>
 *   <li>{@code GET /eligible-assets} (query {@code recipientId} tùy chọn) → {@link #eligibleAssets}</li>
 *   <li>{@code POST /deliveries} → {@link #deliver}</li>
 *   <li>{@code GET /deliveries} → {@link #list}</li>
 * </ul>
 * Ghi bảng {@code handover_items}, chuyển Vault sang HANDOVER_IN_PROGRESS ở lần giao đầu và ghi audit {@code HANDOVER_ASSET_DELIVERED}.
 */
@Service
public class HandoverDeliveryService {
private final com.legacyvault.verification.group.GroupHandoverService group;

    /**
     * Mã bước quy trình ghi vào audit (ST-25).
     */
    static final String STEP_ID = "ST-25";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit (LV-HANDOVER-001).
     */
    static final String RULE_ID = "LV-HANDOVER-001";

    private final HandoverAuthorizationGuard guard;
    private final HandoverScopeResolver scope;
    private final HandoverItemRepository items;
    private final HandoverSessionRepository sessions;
    private final VerificationCaseRepository cases;
    private final AuditService audit;

    /**
     * Cấu hình {@code legacyvault.handover.require-linked-account} (mặc định true): bắt buộc người nhận đã liên kết tài khoản chính thức mới được giao.
     */
    private final boolean requireLinkedAccount;

    /**
     * Khởi tạo với cổng quyền, bộ phân giải phạm vi, repository mục/phiên/ca, audit, cấu hình bắt buộc tài khoản và bàn giao nhóm.
     */
    public HandoverDeliveryService(HandoverAuthorizationGuard guard, HandoverScopeResolver scope,
            HandoverItemRepository items, HandoverSessionRepository sessions, VerificationCaseRepository cases,
            AuditService audit,
            @Value("${legacyvault.handover.require-linked-account:true}") boolean requireLinkedAccount, com.legacyvault.verification.group.GroupHandoverService group) {
this.group=group;
        this.requireLinkedAccount = requireLinkedAccount;
        this.guard = guard;
        this.scope = scope;
        this.items = items;
        this.sessions = sessions;
        this.cases = cases;
        this.audit = audit;
    }

    /**
     * PS-64: assets that may be handed over now, optionally narrowed to one recipient.
     *
     * <p>Endpoint {@code GET .../eligible-assets}: qua {@link HandoverAuthorizationGuard#authorize} rồi dùng {@link HandoverScopeResolver} lấy các dòng
     * đã được Legal duyệt, đánh dấu mỗi dòng ELIGIBLE/DELIVERED và chặn dòng chưa có tài khoản liên kết.
     *
     * @param recipientPublicId lọc theo một người nhận (có thể null)
     * @return danh sách tài sản và trạng thái giao
     */
    @Transactional
    public List<EligibleHandoverAssetResponse> eligibleAssets(UUID casePublicId, UUID sessionPublicId,
            UUID recipientPublicId, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        Authorized authorized = guard.authorize(casePublicId, sessionPublicId, staffId);
        return scope.resolve(authorized.dossier().getLegalBasisDossierId(), authorized.versionNo(), recipientPublicId)
                .stream()
                .map(this::toEligible)
                .toList();
    }

    /**
     * Chuyển một dòng phạm vi thành response; dòng chưa giao mà thiếu tài khoản liên kết bị chặn ({@code BLOCKED_ACCOUNT_REQUIRED}).
     */
    private EligibleHandoverAssetResponse toEligible(ScopeLine line) {
        boolean blocked = !line.delivered() && accountMissing(line);
        return new EligibleHandoverAssetResponse(line.row().assetPublicId(),
                line.row().beneficiaryPublicId(), line.row().description(),
                line.delivered() ? EligibleHandoverAssetResponse.DELIVERED
                        : EligibleHandoverAssetResponse.ELIGIBLE,
                line.row().assetName(), line.row().beneficiaryName(), line.row().recipientSource(),
                line.row().accountLinked(), !line.delivered() && !blocked,
                blocked ? EligibleHandoverAssetResponse.BLOCKED_ACCOUNT_REQUIRED : null);
    }

    /**
     * BE-02 (LV-HANDOVER-001): a new delivery needs the recipient's own linked official account.
     *
     * @return {@code true} nếu cấu hình yêu cầu tài khoản liên kết mà người nhận chưa có
     */
    private boolean accountMissing(ScopeLine line) {
        return requireLinkedAccount && !line.row().accountLinked();
    }

    /**
     * PS-65: record the delivery of the chosen assets to one recipient. All or nothing.
     *
     * <p>Endpoint {@code POST .../deliveries}: ghi nhận giao các tài sản đã chọn cho một người nhận, tất cả hoặc không gì cả.
     *
     * Các bước: kiểm tra request (có người nhận, danh sách tài sản không rỗng và không trùng); qua cổng quyền; kiểm tra bàn giao nhóm sẵn sàng;
     * mọi tài sản phải nằm trong phạm vi được duyệt, chưa giao và đủ tài khoản; lưu các {@link HandoverItem} (khóa duy nhất theo dòng phân bổ
     * chặn giao trùng khi đồng thời); chuyển Vault sang HANDOVER_IN_PROGRESS; ghi audit {@code HANDOVER_ASSET_DELIVERED}.
     *
     * @param request người nhận và danh sách tài sản
     * @return các mục giao vừa tạo
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED, HANDOVER_ASSET_NOT_ELIGIBLE, HANDOVER_ASSET_ALREADY_DELIVERED,
     *         HANDOVER_RECIPIENT_ACCOUNT_REQUIRED và lỗi từ cổng quyền
     */
    @Transactional
    public List<HandoverItemResponse> deliver(UUID casePublicId, UUID sessionPublicId,
            HandoverDeliveryRequest request, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.recipientId() == null || request.assetIds() == null
                || request.assetIds().isEmpty()
                || new HashSet<>(request.assetIds()).size() != request.assetIds().size()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        Authorized authorized = guard.authorize(casePublicId, sessionPublicId, staffId);
        group.requireReady(casePublicId,sessionPublicId,principal);
        List<ScopeLine> recipientLines = scope.resolve(authorized.dossier().getLegalBasisDossierId(),
                authorized.versionNo(), request.recipientId());
        Map<UUID, ScopeLine> byAsset = recipientLines.stream()
                .collect(Collectors.toMap(line -> line.row().assetPublicId(), Function.identity(), (a, b) -> a));

        List<ScopeLine> selected = request.assetIds().stream().map(byAsset::get).toList();
        if (selected.stream().anyMatch(java.util.Objects::isNull)) {
            throw new BusinessException(ErrorCode.HANDOVER_ASSET_NOT_ELIGIBLE);
        }
        if (selected.stream().anyMatch(ScopeLine::delivered)) {
            throw new BusinessException(ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED);
        }
        if (selected.stream().anyMatch(this::accountMissing)) {
            throw new BusinessException(ErrorCode.HANDOVER_RECIPIENT_ACCOUNT_REQUIRED);
        }

        Long sessionId = authorized.session().getId();
        List<HandoverItem> created = selected.stream()
                .map(line -> new HandoverItem(sessionId, line.row().allocationId(), line.row().assetId(),
                        line.row().beneficiaryId(), staffId))
                .toList();
        try {
            created = items.saveAllAndFlush(created);
        } catch (DataIntegrityViolationException duplicate) {
            // The unique allocation key is the final guard against a concurrent double delivery.
            throw new BusinessException(ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED);
        }

        String vaultBefore = authorized.vault().getStatus();
        authorized.vault().markHandoverInProgress();
        audit.record(new AuditEvent(AuditAction.HANDOVER_ASSET_DELIVERED, AuditActorType.USER, staffId,
                authorized.vault().getVaultId(), "HANDOVER_SESSION", sessionId, vaultBefore,
                authorized.vault().getStatus(), null,
                Map.of("sessionPublicId", sessionPublicId.toString(),
                        "casePublicId", casePublicId.toString(),
                        "recipientPublicId", request.recipientId().toString(),
                        "dossierVersionNo", authorized.versionNo(),
                        "assetCount", created.size(),
                        "itemPublicIds", created.stream().map(item -> item.getPublicId().toString()).toList()),
                STEP_ID, RULE_ID));

        Set<UUID> createdIds = created.stream().map(HandoverItem::getPublicId).collect(Collectors.toSet());
        return items.findRowsBySession(sessionId).stream()
                .filter(row -> createdIds.contains(row.itemPublicId()))
                .map(HandoverDeliveryService::toResponse)
                .toList();
    }

    /**
     * History of deliveries of one session; Staff must own the case and the session.
     *
     * <p>Endpoint {@code GET .../deliveries}: lịch sử giao của một phiên, Staff phải phụ trách ca và phiên.
     *
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND
     */
    @Transactional(readOnly = true)
    public List<HandoverItemResponse> list(UUID casePublicId, UUID sessionPublicId, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        var verificationCase = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var session = sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return items.findRowsBySession(session.getId()).stream().map(HandoverDeliveryService::toResponse).toList();
    }

    /**
     * Chuyển một dòng truy vấn {@link HandoverItemRow} thành response.
     */
    private static HandoverItemResponse toResponse(HandoverItemRow row) {
        return new HandoverItemResponse(row.itemPublicId(), row.sessionPublicId(), row.assetPublicId(),
                row.beneficiaryPublicId(), row.status(), row.deliveredAt(), row.staffPublicId());
    }
}

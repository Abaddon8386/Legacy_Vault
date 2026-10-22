package com.legacyvault.verification.service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

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
 * made by Staff at the counter. Every operation passes {@link HandoverAuthorizationGuard} first, then works only on
 * the Legal-approved lines of the current dossier version. Deliveries are all-or-nothing, append-only and audited.
 * The first delivery moves the Vault UNLOCKED -> HANDOVER_IN_PROGRESS.
 */
@Service
public class HandoverDeliveryService {

    static final String STEP_ID = "ST-25";
    static final String RULE_ID = "LV-HANDOVER-001";

    private final HandoverAuthorizationGuard guard;
    private final HandoverScopeResolver scope;
    private final HandoverItemRepository items;
    private final HandoverSessionRepository sessions;
    private final VerificationCaseRepository cases;
    private final AuditService audit;

    public HandoverDeliveryService(HandoverAuthorizationGuard guard, HandoverScopeResolver scope,
            HandoverItemRepository items, HandoverSessionRepository sessions, VerificationCaseRepository cases,
            AuditService audit) {
        this.guard = guard;
        this.scope = scope;
        this.items = items;
        this.sessions = sessions;
        this.cases = cases;
        this.audit = audit;
    }

    /** PS-64: assets that may be handed over now, optionally narrowed to one recipient. */
    @Transactional
    public List<EligibleHandoverAssetResponse> eligibleAssets(UUID casePublicId, UUID sessionPublicId,
            UUID recipientPublicId, CustomUserPrincipal principal) {
        Long staffId = CustomUserPrincipal.requireUserId(principal);
        Authorized authorized = guard.authorize(casePublicId, sessionPublicId, staffId);
        return scope.resolve(authorized.dossier().getLegalBasisDossierId(), authorized.versionNo(), recipientPublicId)
                .stream()
                .map(line -> new EligibleHandoverAssetResponse(line.row().assetPublicId(),
                        line.row().beneficiaryPublicId(), line.row().description(),
                        line.delivered() ? EligibleHandoverAssetResponse.DELIVERED
                                : EligibleHandoverAssetResponse.ELIGIBLE,
                        line.row().assetName(), line.row().beneficiaryName()))
                .toList();
    }

    /** PS-65: record the delivery of the chosen assets to one recipient. All or nothing. */
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

    /** History of deliveries of one session; Staff must own the case and the session. */
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

    private static HandoverItemResponse toResponse(HandoverItemRow row) {
        return new HandoverItemResponse(row.itemPublicId(), row.sessionPublicId(), row.assetPublicId(),
                row.beneficiaryPublicId(), row.status(), row.deliveredAt(), row.staffPublicId());
    }
}

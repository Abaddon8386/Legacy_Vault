package com.legacyvault.verification.service;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.repository.HandoverItemRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;

/**
 * PS-64 (ST-25, LV-HANDOVER-001): computes which assets may be handed to whom, from the Legal-approved allocation
 * lines of the current dossier version only. Anything outside that scope is excluded and, when explicitly asked for,
 * rejected. The Owner configured Beneficiary list is never used (LV-LEG-001). Runs inside a transaction already
 * guarded by {@link HandoverAuthorizationGuard}, so the approval and the scope are read in one snapshot.
 */
@Component
public class HandoverScopeResolver {

    private final LegalBasisVersionAllocationRepository allocations;
    private final HandoverItemRepository items;

    public HandoverScopeResolver(LegalBasisVersionAllocationRepository allocations, HandoverItemRepository items) {
        this.allocations = allocations;
        this.items = items;
    }

    /** One approved allocation line with its delivery state. */
    public record ScopeLine(ReceiptAllocationRow row, boolean delivered) {}

    /**
     * Approved lines of the current version for recipients who passed the in-person check, optionally narrowed to one
     * recipient. A recipient that is requested but outside the scope or not verified is rejected.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<ScopeLine> resolve(Long dossierId, int versionNo, UUID recipientPublicId) {
        List<ReceiptAllocationRow> approved = allocations.findReceiptRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo
                        && LegalBasisVersionAllocation.STATUS_APPROVED.equals(row.status()))
                .toList();
        if (recipientPublicId != null) {
            List<ReceiptAllocationRow> forRecipient = approved.stream()
                    .filter(row -> row.beneficiaryPublicId().equals(recipientPublicId)).toList();
            boolean verified = !forRecipient.isEmpty() && forRecipient.stream().allMatch(
                    row -> Beneficiary.VERIFIED_AT_COUNTER.equals(row.beneficiaryIdentityVerificationStatus()));
            if (!verified) {
                throw new BusinessException(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
            }
            approved = forRecipient;
        } else {
            approved = approved.stream().filter(row -> Beneficiary.VERIFIED_AT_COUNTER
                    .equals(row.beneficiaryIdentityVerificationStatus())).toList();
        }
        Set<Long> delivered = deliveredIds(approved.stream().map(ReceiptAllocationRow::allocationId).toList());
        return approved.stream().map(row -> new ScopeLine(row, delivered.contains(row.allocationId()))).toList();
    }

    private Set<Long> deliveredIds(Collection<Long> allocationIds) {
        if (allocationIds.isEmpty()) {
            return Set.of();
        }
        return items.findDeliveredAllocationIds(allocationIds).stream().collect(Collectors.toSet());
    }
}

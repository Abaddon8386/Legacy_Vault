package com.legacyvault.verification.group;

import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.service.AllocationScopeHash;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * PS-119/122: the single definition of the "current scope" fingerprint a group attendance is bound to. Locked writes
 * (PS-120) and the lock-free reads (PS-122) must hash exactly the same inputs, otherwise a read could show READY while
 * delivery is blocked, or the reverse.
 */
final class GroupFingerprint {
    private GroupFingerprint() { }

    static String of(UUID sessionPublicId, Long assignedStaffUserId, LocalDateTime caseUpdatedAt,
            LocalDateTime dossierUpdatedAt, int versionNo, String versionSha256, String scopeHash,
            UUID latestApprovalPublicId, Collection<ReceiptAllocationRow> rows) {
        return AllocationScopeHash.hashCanonicalValues(List.of(sessionPublicId.toString(),
                String.valueOf(assignedStaffUserId), String.valueOf(caseUpdatedAt), String.valueOf(dossierUpdatedAt),
                String.valueOf(versionNo), versionSha256, scopeHash, latestApprovalPublicId.toString(),
                AllocationScopeHash.hashReceiptRows(rows)));
    }
}

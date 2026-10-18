package com.legacyvault.verification;

import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.service.AllocationScopeHash;
import com.legacyvault.verification.service.LegalBasisReviewService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AllocationScopeHashTest {
    private static final UUID ASSET_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID BENEFICIARY_A = UUID.fromString("00000000-0000-0000-0000-000000000011");
    private static final UUID ASSET_B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID BENEFICIARY_B = UUID.fromString("00000000-0000-0000-0000-000000000012");

    @Test
    void reviewApprovalGuardAndReceiptUseTheSameCanonicalAllocationHash() {
        var approvalRows = List.of(
                new AllocationRow(4, ASSET_A, BENEFICIARY_A, null),
                new AllocationRow(4, ASSET_B, BENEFICIARY_B, "second asset"));
        var receiptRows = List.of(
                new ReceiptAllocationRow(4, 101L, 201L, ASSET_A, 301L, BENEFICIARY_A,
                        "VERIFIED_AT_COUNTER", "APPROVED", null),
                new ReceiptAllocationRow(4, 102L, 202L, ASSET_B, 302L, BENEFICIARY_B,
                        "VERIFIED_AT_COUNTER", "APPROVED", "second asset"));

        String expected = LegalBasisReviewService.allocationHashFromCanonicalValues(List.of(
                AllocationScopeHash.canonicalValue(ASSET_A, BENEFICIARY_A, null),
                AllocationScopeHash.canonicalValue(ASSET_B, BENEFICIARY_B, "second asset")));
        assertThat(AllocationScopeHash.hashApprovalRows(approvalRows)).isEqualTo(expected);
        assertThat(AllocationScopeHash.hashApprovalRows(approvalRows.reversed())).isEqualTo(expected);
        assertThat(AllocationScopeHash.hashReceiptRows(receiptRows)).isEqualTo(expected);
    }

    @Test
    void hashChangesWhenAllocationScopeChangesAndNullCanonicalizationIsStable() {
        String original = AllocationScopeHash.hashApprovalRows(List.of(
                new AllocationRow(4, ASSET_A, BENEFICIARY_A, null)));
        String changedScope = AllocationScopeHash.hashApprovalRows(List.of(
                new AllocationRow(4, ASSET_A, BENEFICIARY_B, null)));
        String changedDescription = AllocationScopeHash.hashApprovalRows(List.of(
                new AllocationRow(4, ASSET_A, BENEFICIARY_A, "changed")));

        assertThat(original).isNotEqualTo(changedScope).isNotEqualTo(changedDescription);
        assertThat(AllocationScopeHash.canonicalValue(ASSET_A, BENEFICIARY_A, null))
                .isEqualTo(ASSET_A + "|" + BENEFICIARY_A + "|null");
    }
}

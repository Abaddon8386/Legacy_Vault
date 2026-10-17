
package com.legacyvault.verification;

import com.legacyvault.verification.service.LegalBasisReviewService;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LegalBasisReviewServiceTest {

    @Test
    void allocationHash_shouldBeIndependentOfInputOrder() {
        String first = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1", "asset-B|beneficiary-Y|scope-2")
        );

        String second = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-B|beneficiary-Y|scope-2", "asset-A|beneficiary-X|scope-1")
        );

        assertEquals(first, second);
    }

    @Test
    void allocationHash_shouldChangeWhenAllocationScopeChanges() {
        String before = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1")
        );

        String after = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-Y|scope-1")
        );

        assertNotEquals(before, after);
    }

    @Test
    void allocationHash_shouldChangeWhenAllocationIsAdded() {
        String before = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1")
        );

        String after = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1", "asset-B|beneficiary-Y|scope-2")
        );

        assertNotEquals(before, after);
    }
}

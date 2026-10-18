package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.repository.HandoverItemRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.service.HandoverScopeResolver;

/** PS-64 (ST-25, LV-HANDOVER-001): the eligible set comes only from approved lines of the current version. */
class HandoverScopeResolverTest {

    private static final Long DOSSIER_ID = 900L;
    private static final UUID ASSET_A = UUID.randomUUID();
    private static final UUID ASSET_B = UUID.randomUUID();
    private static final UUID ASSET_C = UUID.randomUUID();
    private static final UUID RECIPIENT_1 = UUID.randomUUID();
    private static final UUID RECIPIENT_2 = UUID.randomUUID();

    private final LegalBasisVersionAllocationRepository allocations = mock(LegalBasisVersionAllocationRepository.class);
    private final HandoverItemRepository items = mock(HandoverItemRepository.class);
    private final HandoverScopeResolver resolver = new HandoverScopeResolver(allocations, items);

    private static ReceiptAllocationRow row(int version, long allocationId, UUID asset, long beneficiaryDbId,
            UUID beneficiary, String identity, String status) {
        return new ReceiptAllocationRow(version, allocationId, allocationId + 100, asset, beneficiaryDbId, beneficiary,
                identity, status, "note " + allocationId);
    }

    private void rows(ReceiptAllocationRow... rows) {
        when(allocations.findReceiptRowsByDossier(DOSSIER_ID)).thenReturn(List.of(rows));
    }

    private static BusinessException expect(Runnable action) {
        try {
            action.run();
        } catch (BusinessException ex) {
            return ex;
        }
        throw new AssertionError("BusinessException expected");
    }

    @Test
    void onlyApprovedLinesOfTheCurrentVersionForVerifiedRecipientsAreEligible() {
        String ok = Beneficiary.VERIFIED_AT_COUNTER;
        rows(row(2, 1, ASSET_A, 11, RECIPIENT_1, ok, "APPROVED"),
                row(2, 2, ASSET_B, 12, RECIPIENT_2, Beneficiary.NOT_VERIFIED, "APPROVED"),
                row(2, 3, ASSET_C, 11, RECIPIENT_1, ok, "REJECTED"),
                row(2, 4, ASSET_C, 11, RECIPIENT_1, ok, "DRAFT"),
                row(1, 5, ASSET_B, 11, RECIPIENT_1, ok, "APPROVED"));
        when(items.findDeliveredAllocationIds(anyCollection())).thenReturn(List.of());

        var lines = resolver.resolve(DOSSIER_ID, 2, null);

        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).row().assetPublicId()).isEqualTo(ASSET_A);
        assertThat(lines.get(0).delivered()).isFalse();
    }

    @Test
    void deliveredLinesStayVisibleButAreMarkedDelivered() {
        String ok = Beneficiary.VERIFIED_AT_COUNTER;
        rows(row(1, 1, ASSET_A, 11, RECIPIENT_1, ok, "APPROVED"), row(1, 2, ASSET_B, 11, RECIPIENT_1, ok, "APPROVED"));
        when(items.findDeliveredAllocationIds(anyCollection())).thenReturn(List.of(1L));

        var lines = resolver.resolve(DOSSIER_ID, 1, RECIPIENT_1);

        assertThat(lines).extracting(line -> line.row().assetPublicId()).containsExactly(ASSET_A, ASSET_B);
        assertThat(lines).extracting(HandoverScopeResolver.ScopeLine::delivered).containsExactly(true, false);
    }

    @Test
    void requestedRecipientNarrowsTheResult() {
        String ok = Beneficiary.VERIFIED_AT_COUNTER;
        rows(row(1, 1, ASSET_A, 11, RECIPIENT_1, ok, "APPROVED"), row(1, 2, ASSET_B, 12, RECIPIENT_2, ok, "APPROVED"));
        when(items.findDeliveredAllocationIds(anyCollection())).thenReturn(List.of());

        var lines = resolver.resolve(DOSSIER_ID, 1, RECIPIENT_2);

        assertThat(lines).extracting(line -> line.row().assetPublicId()).containsExactly(ASSET_B);
    }

    @Test
    void recipientOutsideScopeOrNotVerifiedIsRejected() {
        rows(row(1, 1, ASSET_A, 11, RECIPIENT_1, Beneficiary.VERIFIED_AT_COUNTER, "APPROVED"),
                row(1, 2, ASSET_B, 12, RECIPIENT_2, Beneficiary.NOT_VERIFIED, "APPROVED"),
                row(1, 3, ASSET_C, 13, UUID.randomUUID(), Beneficiary.VERIFIED_AT_COUNTER, "REJECTED"));

        assertThat(expect(() -> resolver.resolve(DOSSIER_ID, 1, UUID.randomUUID())).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
        assertThat(expect(() -> resolver.resolve(DOSSIER_ID, 1, RECIPIENT_2)).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
    }

    @Test
    void emptyApprovedScopeYieldsNothingAndNeverQueriesDeliveries() {
        rows();

        assertThat(resolver.resolve(DOSSIER_ID, 1, null)).isEmpty();
        verify(items, never()).findDeliveredAllocationIds(anyCollection());
    }
}

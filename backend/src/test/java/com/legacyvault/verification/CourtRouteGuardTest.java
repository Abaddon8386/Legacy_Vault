package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.CourtDecisionRepository;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.service.CourtRouteGuard;
import com.legacyvault.verification.service.WillComparisonService;

/** Route-specific evidence gate: legacy NOTARIAL needs a stored deed, no dispute and a MATCH will; COURT is unchanged. */
class CourtRouteGuardTest {
    private static final Long DOSSIER_ID = 5L;
    private static final Long CASE_ID = 9L;

    private final CourtDecisionRepository decisions = mock(CourtDecisionRepository.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final WillComparisonService wills = mock(WillComparisonService.class);
    private final CourtRouteGuard guard = new CourtRouteGuard(decisions, versions, wills);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);

    CourtRouteGuardTest() {
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(dossier.getVerificationCaseId()).thenReturn(CASE_ID);
        when(dossier.getRequiredVersionNo()).thenReturn(1);
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_NOTARIAL);
        when(dossier.getDisputeStatus()).thenReturn(LegalBasisDossier.DISPUTE_NONE);
        when(versions.findMaxVersionNo(DOSSIER_ID)).thenReturn(1);
        when(wills.isApprovalBlocked(CASE_ID)).thenReturn(false);
        deed("NOTARIAL_PARTITION", "Notary Office 1", "045/2026", LocalDate.of(2026, 1, 1), true);
    }

    private void deed(String type, String notary, String number, LocalDate date, boolean hasFile) {
        when(versions.findCourtEvidence(DOSSIER_ID, 1)).thenReturn(Optional.of(new CourtEvidenceVersion(
                11L, 1, "a".repeat(64), type, null, null, null, "FORWARDED", hasFile, notary, number, date)));
    }

    @Test
    void validNotarialDeedWithMatchingWillPasses() {
        assertThat(guard.blocker(dossier)).isNull();
    }

    @Test
    void notarialWithoutStoredFileOrMetadataOrWithCourtTypeIsBlocked() {
        deed("NOTARIAL_PARTITION", "Notary Office 1", "045/2026", LocalDate.of(2026, 1, 1), false);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        deed("NOTARIAL_PARTITION", " ", "045/2026", LocalDate.of(2026, 1, 1), true);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        deed("NOTARIAL_PARTITION", "Notary Office 1", null, LocalDate.of(2026, 1, 1), true);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        deed("NOTARIAL_PARTITION", "Notary Office 1", "045/2026", LocalDate.now().plusDays(1), true);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        deed("COURT_JUDGMENT", "Notary Office 1", "045/2026", LocalDate.of(2026, 1, 1), true);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
    }

    @Test
    void notarialIsBlockedByDisputeAndByAWillThatIsNotMatched() {
        when(dossier.getDisputeStatus()).thenReturn(LegalBasisDossier.DISPUTE_DISPUTED);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        when(dossier.getDisputeStatus()).thenReturn(LegalBasisDossier.DISPUTE_NONE);
        when(wills.isApprovalBlocked(CASE_ID)).thenReturn(true);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.WILL_NOT_VERIFIED);
    }

    @Test
    void notarialStaleVersionBelowTheRequiredOneIsBlocked() {
        when(dossier.getRequiredVersionNo()).thenReturn(2);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
    }

    @Test
    void courtStillNeedsAValidCourtAssessmentAndOtherRoutesAreBlocked() {
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_COURT);
        deed("COURT_JUDGMENT", null, null, null, true);
        when(versions.findCourtEvidence(DOSSIER_ID, 1)).thenReturn(Optional.of(new CourtEvidenceVersion(
                11L, 1, "a".repeat(64), "COURT_JUDGMENT", "Court", "12/2026", LocalDate.of(2026, 1, 1), "FORWARDED", true)));
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.COURT_DECISION_REQUIRED);
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_ON_HOLD);
        assertThat(guard.blocker(dossier)).isEqualTo(ErrorCode.COURT_DECISION_REQUIRED);
    }
}

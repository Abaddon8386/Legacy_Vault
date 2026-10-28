package com.legacyvault.verification;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.*;
import com.legacyvault.common.error.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class NotarialWorkflowPolicyTest {
 private LegalBasisDossier dossier(){var d=new LegalBasisDossier(1L,"NOTARIAL","Received","NONE",2L);ReflectionTestUtils.setField(d,"legalBasisDossierId",3L);return d;}
 private CourtEvidenceVersion evidence(boolean file,String forwarded,String notary,LocalDate date){return new CourtEvidenceVersion(4L,1,"a".repeat(64),"NOTARIAL_PARTITION","Office","DOC-1",LocalDate.now().minusDays(1),forwarded,file,notary,"NOTARY-1",date);}
 @Test void completeForwardedNotarialEvidenceDoesNotRequireACourtDecision(){
  var decisions=mock(CourtDecisionRepository.class);var versions=mock(LegalBasisDossierVersionRepository.class);var guard=new CourtRouteGuard(decisions,versions);var d=dossier();
  when(versions.findMaxVersionNo(3L)).thenReturn(1);when(versions.findCourtEvidence(3L,1)).thenReturn(Optional.of(evidence(true,"FORWARDED","Office",LocalDate.now().minusDays(1))));
  assertThat(guard.blocker(d)).isNull();verifyNoInteractions(decisions);
 }
 @Test void missingFileNotaryMetadataFutureDateOrForwardingCannotPass(){
  for(var evidence:List.of(evidence(false,"FORWARDED","Office",LocalDate.now()),evidence(true,"NOT_FORWARDED","Office",LocalDate.now()),evidence(true,"FORWARDED",null,LocalDate.now()),evidence(true,"FORWARDED","Office",LocalDate.now().plusDays(1)))){
   var decisions=mock(CourtDecisionRepository.class);var versions=mock(LegalBasisDossierVersionRepository.class);when(versions.findMaxVersionNo(3L)).thenReturn(1);when(versions.findCourtEvidence(3L,1)).thenReturn(Optional.of(evidence));
   assertThat(new CourtRouteGuard(decisions,versions).blocker(dossier())).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);verifyNoInteractions(decisions);
  }
 }
 @Test void documentIntakeIsNotLegalClassificationOrApproval(){
  var d=LegalBasisDossier.receivedByStaff(1L,"NOTARIAL",2L);assertThat(d.getClassifiedByUserId()).isNull();assertThat(d.getStatus()).isEqualTo("DRAFT");assertThat(d.getReviewStatus()).isEqualTo("REVIEW_REQUIRED");assertThat(d.acceptsIntake()).isTrue();
 }
 @Test void sequenceGateRequiresAMatchingWillBeforeProtectedTransitions(){
  var access=new LegalBasisCaseAccess(mock(LegalCaseLookupRepository.class),mock(com.legacyvault.vault.repository.VaultRepository.class),mock(VerificationCaseRepository.class),mock(LegalBasisDossierRepository.class),mock(LegalBasisLockedState.class));
  var comparisons=mock(WillComparisonService.class);access.setComparisons(comparisons);var c=mock(VerificationCase.class);when(c.getVerificationCaseId()).thenReturn(1L);
  when(comparisons.isApprovalBlocked(1L)).thenReturn(true);assertThatThrownBy(()->access.requireComparedWill(c)).isInstanceOf(BusinessException.class);
  when(comparisons.isApprovalBlocked(1L)).thenReturn(false);assertThatCode(()->access.requireComparedWill(c)).doesNotThrowAnyException();
 }
}

package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.*;

class DistributionReplacementWorkflowTest {
    final UUID id=UUID.randomUUID();
    final VerificationCase found=mock(VerificationCase.class);
    final Vault vault=mock(Vault.class);
    final LegalBasisDossier dossier=mock(LegalBasisDossier.class);
    final StaffCaseLockRepository staff=mock(StaffCaseLockRepository.class);
    final LegalCaseLookupRepository lookup=mock(LegalCaseLookupRepository.class);
    final VaultRepository vaults=mock(VaultRepository.class);
    final LegalBasisDossierRepository dossiers=mock(LegalBasisDossierRepository.class);
    final LegalBasisDossierVersionRepository versions=mock(LegalBasisDossierVersionRepository.class);
    final DistributionWorkflowEventRepository events=mock(DistributionWorkflowEventRepository.class);
    final WillComparisonService wills=mock(WillComparisonService.class);
    final CustomUserPrincipal principal=new CustomUserPrincipal(1L,UUID.randomUUID(),"test@example.test");
    final DistributionWorkflowService service=new DistributionWorkflowService(null,staff,lookup,vaults,dossiers,versions,null,
        events,wills,mock(CourtRouteGuard.class),null,null,null,null,null,null,null,null,null,null,null);

    DistributionReplacementWorkflowTest() {
        when(found.getVerificationCaseId()).thenReturn(2L);when(found.getPublicId()).thenReturn(id);
        when(found.getVaultId()).thenReturn(3L);when(found.isOpen()).thenReturn(true);
        when(staff.findOwnedByStaff(id,1L)).thenReturn(Optional.of(found));when(lookup.findByPublicId(id)).thenReturn(Optional.of(found));
        when(vaults.findById(3L)).thenReturn(Optional.of(vault));when(vault.getStatus()).thenReturn("AWAITING_LEGAL_BASIS");
        when(dossiers.findByVerificationCaseId(2L)).thenReturn(Optional.of(dossier));
        when(dossier.getLegalBasisDossierId()).thenReturn(4L);when(dossier.getRoute()).thenReturn("NOTARIAL");
        when(dossier.getRequiredVersionNo()).thenReturn(1);
        when(events.findByVerificationCaseIdOrderByEventNoAsc(2L)).thenReturn(List.of(new DistributionWorkflowEvent(2L,1,
            DistributionWorkflowEvent.REQUEST_DOCUMENTS,1L,"Original document request",null,null,null,null)));
        stored(1);
    }
    void stored(int version) {
        when(versions.findRows(4L)).thenReturn(List.of(new BasisVersionRow(version,"NOTARIAL_PARTITION","Office","N1",null,
            null,null,null,null,null,"application/pdf",1L,"a".repeat(64),"FORWARDED",1L,LocalDateTime.now(),LocalDateTime.now())));
    }
    @Test void resumedCaseRequiringNewVersionLetsStaffIntakeAndStopsLegalReviewOfOldFile() {
        long before=service.view(id,"STAFF",principal).revision();
        when(dossier.getRequiredVersionNo()).thenReturn(2);when(dossier.getStatus()).thenReturn("DRAFT");
        var staffView=service.view(id,"STAFF",principal);var legalView=service.view(id,"LEGAL",principal);
        assertThat(staffView.phase()).isEqualTo("AWAITING_DOCUMENTS");
        assertThat(staffView.capabilities().get("uploadDocuments").allowed()).isTrue();
        assertThat(staffView.capabilities().get("forwardDocuments").allowed()).isFalse();
        assertThat(legalView.capabilities().get("approveDocuments").allowed()).isFalse();
        assertThat(legalView.capabilities().get("requestDocumentSupplementation").allowed()).isFalse();
        assertThat(staffView.revision()).isGreaterThan(before);
        assertThat(staffView.feedback()).isNull(); // Never invent a reason that was not saved.
    }
    @Test void forwardingRequiredNewVersionReturnsToLegalAssessment() {
        when(dossier.getRequiredVersionNo()).thenReturn(2);stored(2);
        assertThat(service.view(id,"LEGAL",principal).phase()).isEqualTo("DOCUMENTS_UNDER_REVIEW");
        assertThat(service.view(id,"STAFF",principal).capabilities().get("uploadDocuments").allowed()).isFalse();
    }
    @Test void holdStillBlocksStaffIntakeEvenWhenANewerVersionIsRequired() {
        when(dossier.getRequiredVersionNo()).thenReturn(2);when(dossier.getRoute()).thenReturn("ON_HOLD");
        assertThat(service.view(id,"STAFF",principal).capabilities().get("uploadDocuments").allowed()).isFalse();
    }
    @Test void closedCaseDoesNotReopenWhenANewerVersionIsRequired() {
        when(dossier.getRequiredVersionNo()).thenReturn(2);when(found.isOpen()).thenReturn(false);
        var view=service.view(id,"STAFF",principal);
        assertThat(view.phase()).isEqualTo("CLOSED");assertThat(view.capabilities().get("uploadDocuments").allowed()).isFalse();
    }
}

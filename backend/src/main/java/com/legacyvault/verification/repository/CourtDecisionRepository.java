package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.CourtDecision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface CourtDecisionRepository extends JpaRepository<CourtDecision, Long> {
    Optional<CourtDecision> findFirstByDossierVersionIdOrderByIdDesc(Long versionId);

    @Query("""
        select new com.legacyvault.verification.repository.CourtDecisionRow(
            c.publicId, vc.publicId, v.versionNo, v.sha256Hash, c.result, c.reason, u.publicId, c.reviewedAt)
        from CourtDecision c, LegalBasisDossierVersion v, LegalBasisDossier d, VerificationCase vc, User u
        where c.dossierVersionId = v.dossierVersionId and v.legalBasisDossierId = d.legalBasisDossierId
          and d.verificationCaseId = vc.verificationCaseId and u.userId = c.reviewedByUserId
          and vc.verificationCaseId = :caseId
        order by c.id desc
        """)
    List<CourtDecisionRow> findRows(@Param("caseId") Long caseId);
}

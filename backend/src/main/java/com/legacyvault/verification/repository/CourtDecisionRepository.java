package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.CourtDecision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

/**
 * Repository cho quyết định tòa án ({@code CourtDecision}); được {@code CourtDecisionService} (và luồng phê duyệt Legal) dùng.
 */
public interface CourtDecisionRepository extends JpaRepository<CourtDecision, Long> {
    /**
     * Quyết định tòa án mới nhất của một phiên bản văn bản.
     */
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
    /**
     * Lịch sử quyết định của ca (mới nhất trước) dưới dạng {@link CourtDecisionRow}, nối các bảng
     * {@code court_decisions}, {@code legal_basis_dossier_versions}, {@code legal_basis_dossiers},
     * {@code verification_cases} và {@code users}. Phục vụ {@code GET .../court-decisions}.
     */
    List<CourtDecisionRow> findRows(@Param("caseId") Long caseId);
}

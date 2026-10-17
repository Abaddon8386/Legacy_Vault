package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisDossier;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** Mỗi ca tối đa một hồ sơ căn cứ (chỉ mục duy nhất UX_legal_basis_dossiers_case). */
public interface LegalBasisDossierRepository extends JpaRepository<LegalBasisDossier, Long> {

    Optional<LegalBasisDossier> findByVerificationCaseId(Long verificationCaseId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from LegalBasisDossier d where d.verificationCaseId = :caseId")
    Optional<LegalBasisDossier> findByVerificationCaseIdForUpdate(@Param("caseId") Long caseId);
}

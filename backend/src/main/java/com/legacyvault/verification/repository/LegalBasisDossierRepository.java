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

    /**
     * Hồ sơ căn cứ của ca (không khóa).
     */
    Optional<LegalBasisDossier> findByVerificationCaseId(Long verificationCaseId);

    /**
     * Khóa ghi bi quan hồ sơ theo ca. Thứ tự khóa chuẩn của luồng: Vault -> VerificationCase -> Dossier; hàm này chỉ gọi sau khi đã khóa Vault và ca.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from LegalBasisDossier d where d.verificationCaseId = :caseId")
    Optional<LegalBasisDossier> findByVerificationCaseIdForUpdate(@Param("caseId") Long caseId);

    /**
     * Khóa ghi bi quan hồ sơ theo khóa nội bộ; caller phải tuân thủ cùng thứ tự khóa Vault -> ca -> hồ sơ.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from LegalBasisDossier d where d.legalBasisDossierId = :dossierId")
    Optional<LegalBasisDossier> findByDossierIdForUpdate(
            @Param("dossierId") Long dossierId
    );
}

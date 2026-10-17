package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Phiên bản chỉ thêm mới; các truy vấn đọc trả {@link BasisVersionRow} để không nạp nội dung file. */
public interface LegalBasisDossierVersionRepository extends JpaRepository<LegalBasisDossierVersion, Long> {

    @Query("select coalesce(max(v.versionNo), 0) from LegalBasisDossierVersion v where v.legalBasisDossierId = :dossierId")
    int findMaxVersionNo(@Param("dossierId") Long dossierId);

    @Query("""
        select new com.legacyvault.verification.repository.BasisVersionRow(
            v.versionNo, v.legalBasisType, v.issuingAuthority, v.documentNumber, v.issueDate, v.notaryAuthority,
            v.notarialDocumentNumber, v.notarizedAt, v.evidenceMetadata, v.versionNotes, v.contentType, v.fileSizeBytes,
            v.sha256Hash, v.forwardStatus, v.createdByUserId, v.createdAt, v.forwardedAt)
        from LegalBasisDossierVersion v
        where v.legalBasisDossierId = :dossierId
        order by v.versionNo desc
        """)
    List<BasisVersionRow> findRows(@Param("dossierId") Long dossierId);
}

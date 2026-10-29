package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Chỉ thêm mới và đọc: phân bổ của một phiên bản là chứng cứ, phiên bản mới có bộ phân bổ riêng. */
public interface LegalBasisVersionAllocationRepository extends JpaRepository<LegalBasisVersionAllocation, Long> {

    @Modifying
    @Query("update LegalBasisVersionAllocation a set a.status = :status where a.dossierVersionId = :versionId and a.status <> 'SUPERSEDED'")
    int updateStatusForVersion(@Param("versionId") Long versionId, @Param("status") String status);

    /** A corrected allocation replaces the previous one for the same document version; old rows stay as history. */
    @Modifying
    @Query("update LegalBasisVersionAllocation a set a.status = 'SUPERSEDED' where a.dossierVersionId = :versionId and a.status <> 'SUPERSEDED'")
    int supersedeForVersion(@Param("versionId") Long versionId);

    @Query("""
        select new com.legacyvault.verification.repository.AllocationRow(
            v.versionNo, a.publicId, b.publicId, al.allocationDescription,
            a.name, a.assetType, b.fullName, b.relationship, b.origin, ov.versionNo, b.linkedUserId)
        from LegalBasisVersionAllocation al, LegalBasisDossierVersion v, Asset a, Beneficiary b
            left join LegalBasisDossierVersion ov on ov.dossierVersionId = b.originDossierVersionId
        where v.legalBasisDossierId = :dossierId
          and al.dossierVersionId = v.dossierVersionId
          and a.assetId = al.assetId
          and b.id = al.beneficiaryId
          and al.status <> 'SUPERSEDED'
        order by v.versionNo desc, al.allocationId asc
        """)
    List<AllocationRow> findRowsByDossier(@Param("dossierId") Long dossierId);

    @Query("""
        select new com.legacyvault.verification.repository.ReceiptAllocationRow(
            v.versionNo, al.allocationId, a.assetId, a.publicId, b.id, b.publicId, b.identityVerificationStatus,
            al.status, al.allocationDescription, a.name, b.fullName, b.linkedUserId, b.origin)
        from LegalBasisVersionAllocation al, LegalBasisDossierVersion v, Asset a, Beneficiary b
        where v.legalBasisDossierId = :dossierId
          and al.dossierVersionId = v.dossierVersionId
          and a.assetId = al.assetId
          and b.id = al.beneficiaryId
          and al.status <> 'SUPERSEDED'
        order by al.allocationId asc
        """)
    List<ReceiptAllocationRow> findReceiptRowsByDossier(@Param("dossierId") Long dossierId);
}

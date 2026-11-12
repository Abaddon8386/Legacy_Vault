package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Chỉ thêm mới và đọc: phân bổ của một phiên bản là chứng cứ, phiên bản mới có bộ phân bổ riêng.
 *
 * Bảng {@code legal_basis_version_allocations}. Được tiếp nhận, phê duyệt, bàn giao và cổng nhóm dùng.
 */
public interface LegalBasisVersionAllocationRepository extends JpaRepository<LegalBasisVersionAllocation, Long> {

    /**
     * Đặt {@code status} cho mọi dòng phân bổ của phiên bản (trừ dòng đã SUPERSEDED), ví dụ khi Legal duyệt.
     *
     * @return số dòng cập nhật
     */
    @Modifying
    @Query("update LegalBasisVersionAllocation a set a.status = :status where a.dossierVersionId = :versionId and a.status <> 'SUPERSEDED'")
    int updateStatusForVersion(@Param("versionId") Long versionId, @Param("status") String status);

    /**
     * A corrected allocation replaces the previous one for the same document version; old rows stay as history.
     *
     * Đánh dấu SUPERSEDED mọi dòng phân bổ còn hiệu lực của phiên bản.
     *
     * @return số dòng cập nhật
     */
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
    /**
     * Các dòng phân bổ chưa bị thay thế của hồ sơ dạng {@link AllocationRow}, phiên bản mới nhất trước.
     */
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
    /**
     * Các dòng phân bổ chưa bị thay thế dạng {@link ReceiptAllocationRow}, dùng để dựng biên nhận và tính hash phạm vi.
     */
    List<ReceiptAllocationRow> findReceiptRowsByDossier(@Param("dossierId") Long dossierId);
}

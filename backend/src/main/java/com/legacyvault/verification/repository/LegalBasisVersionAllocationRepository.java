package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** Chỉ thêm mới và đọc: phân bổ của một phiên bản là chứng cứ, phiên bản mới có bộ phân bổ riêng. */
public interface LegalBasisVersionAllocationRepository extends JpaRepository<LegalBasisVersionAllocation, Long> {

    // Đổi trạng thái mọi phân bổ chưa bị thay thế của một phiên bản (APPROVED/REJECTED...) khi Legal ra quyết định; dòng SUPERSEDED được giữ nguyên làm lịch sử.
    @Modifying
    @Query("update LegalBasisVersionAllocation a set a.status = :status where a.dossierVersionId = :versionId and a.status <> 'SUPERSEDED'")
    int updateStatusForVersion(@Param("versionId") Long versionId, @Param("status") String status);

    /** Phân bổ đã sửa thay thế phân bổ trước của cùng phiên bản tài liệu; các dòng cũ được giữ làm lịch sử. */
    @Modifying
    @Query("update LegalBasisVersionAllocation a set a.status = 'SUPERSEDED' where a.dossierVersionId = :versionId and a.status <> 'SUPERSEDED'")
    int supersedeForVersion(@Param("versionId") Long versionId);

    // Phân bổ hiện hành (loại SUPERSEDED) của toàn bộ phiên bản trong hồ sơ, kèm thông tin tài sản và người thụ hưởng; ov là phiên bản gốc
    // phát sinh người thụ hưởng (left join vì có thể không có). Kết quả là đầu vào của allocationHash dùng để chốt phạm vi phê duyệt.
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

    // Phân bổ hiện hành dùng cho biên nhận bàn giao, kèm trạng thái xác minh danh tính của người thụ hưởng.
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

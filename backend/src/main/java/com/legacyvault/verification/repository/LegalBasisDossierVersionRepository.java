package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Phiên bản chỉ thêm mới; các truy vấn đọc trả {@link BasisVersionRow} để không nạp nội dung file.
 *
 * Bảng {@code legal_basis_dossier_versions}. Được tiếp nhận, chuyển, review, phê duyệt và xem hồ sơ dùng.
 */
public interface LegalBasisDossierVersionRepository extends JpaRepository<LegalBasisDossierVersion, Long> {

    @Query("""
        select new com.legacyvault.verification.repository.CourtEvidenceVersion(
            v.dossierVersionId, v.versionNo, v.sha256Hash, v.legalBasisType, v.issuingAuthority,
            v.documentNumber, v.issueDate, v.forwardStatus,
            case when v.encryptedFileContent is not null and v.fileSizeBytes > 0 then true else false end,
            v.notaryAuthority, v.notarialDocumentNumber, v.notarizedAt)
        from LegalBasisDossierVersion v
        where v.legalBasisDossierId = :dossierId and v.versionNo = :versionNo
        """)
    /**
     * Metadata phiên bản dạng {@link CourtEvidenceVersion} (không nạp nội dung file mã hóa; {@code hasFile} suy từ
     * {@code encryptedFileContent}). Rỗng nếu phiên bản không tồn tại.
     */
    java.util.Optional<CourtEvidenceVersion> findCourtEvidence(@Param("dossierId") Long dossierId,
            @Param("versionNo") int versionNo);

    /**
     * Số phiên bản lớn nhất của hồ sơ; 0 nếu chưa có phiên bản nào.
     */
    @Query("select coalesce(max(v.versionNo), 0) from LegalBasisDossierVersion v where v.legalBasisDossierId = :dossierId")
    int findMaxVersionNo(@Param("dossierId") Long dossierId);

    /**
     * Entity đầy đủ (kể cả nội dung file mã hóa) của một phiên bản, dùng khi cần tải file.
     */
    Optional<LegalBasisDossierVersion> findByLegalBasisDossierIdAndVersionNo(
            Long legalBasisDossierId,
            int versionNo
    );

    /**
     * Đánh dấu một phiên bản đã chuyển Legal bằng một câu UPDATE có điều kiện (chỉ khi chưa chuyển): an toàn khi hai Staff
     * cùng chuyển và không nạp nội dung file. Trả 1 nếu thành công.
     */
    @Modifying
    @Query("""
        update LegalBasisDossierVersion v
        set v.forwardStatus = 'FORWARDED', v.forwardedByUserId = :staffUserId, v.forwardedAt = :at
        where v.legalBasisDossierId = :dossierId and v.versionNo = :versionNo and v.forwardStatus = 'NOT_FORWARDED'
        """)
    /**
     * UPDATE có điều kiện đặt {@code forwardStatus=FORWARDED}, người chuyển và thời điểm; chỉ khi đang NOT_FORWARDED.
     *
     * @return 1 nếu thành công, 0 nếu phiên bản đã được chuyển
     */
    int markForwarded(@Param("dossierId") Long dossierId, @Param("versionNo") int versionNo,
            @Param("staffUserId") Long staffUserId, @Param("at") LocalDateTime at);

    @Query("""
        select new com.legacyvault.verification.repository.BasisVersionRow(
            v.versionNo, v.legalBasisType, v.issuingAuthority, v.documentNumber, v.issueDate, v.notaryAuthority,
            v.notarialDocumentNumber, v.notarizedAt, v.evidenceMetadata, v.versionNotes, v.contentType, v.fileSizeBytes,
            v.sha256Hash, v.forwardStatus, v.createdByUserId, v.createdAt, v.forwardedAt)
        from LegalBasisDossierVersion v
        where v.legalBasisDossierId = :dossierId
        order by v.versionNo desc
        """)
    /**
     * Metadata mọi phiên bản của hồ sơ dạng {@link BasisVersionRow}, phiên bản mới nhất trước.
     */
    List<BasisVersionRow> findRows(@Param("dossierId") Long dossierId);
}

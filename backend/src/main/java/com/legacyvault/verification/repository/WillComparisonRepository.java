package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.WillComparison;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Chỉ có thêm mới và đọc: kết quả đối chiếu là chứng cứ nên không có hàm sửa hay xóa (LV-AUD-001).
 *
 * Bảng {@code will_comparisons}. Được {@code WillComparisonService} dùng cho {@code GET/POST .../will-comparisons}.
 */
public interface WillComparisonRepository extends JpaRepository<WillComparison, Long> {

    /** Kết quả đối chiếu mới nhất của ca: căn cứ để chặn hay cho qua luồng duyệt thông thường. */
    Optional<WillComparison> findFirstByVerificationCaseIdOrderByComparedAtDescWillComparisonIdDesc(
            Long verificationCaseId
    );

    /** PS-139: kết luận đối chiếu là duy nhất cho mỗi bản giấy; gọi khi đã giữ khóa Vault -> ca. */
    boolean existsByOriginalWillIntakeId(Long originalWillIntakeId);

    @Query("""
        select new com.legacyvault.verification.repository.WillComparisonRow(
            c.publicId, i.publicId, a.publicId, v.versionNo, c.referencedSha256Hash,
            c.comparisonResult, u.publicId, c.reason, c.comparedAt)
        from WillComparison c, OriginalWillIntake i, AssetVersion v, Asset a, User u
        where c.verificationCaseId = :caseId
          and i.originalWillIntakeId = c.originalWillIntakeId
          and v.assetVersionId = c.assetVersionId
          and a.assetId = v.assetId
          and u.userId = c.checkedByUserId
        order by c.comparedAt desc, c.willComparisonId desc
        """)
    /**
     * Các kết quả đối chiếu của ca (mới nhất trước) dạng {@link WillComparisonRow}.
     */
    List<WillComparisonRow> findRowsByCase(@Param("caseId") Long caseId);
}

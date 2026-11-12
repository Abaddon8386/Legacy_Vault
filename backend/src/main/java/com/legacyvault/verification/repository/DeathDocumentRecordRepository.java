package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.DeathDocumentRecord;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Chỉ có thêm mới và đọc: bản ghi tiếp nhận giấy tờ khai tử là chứng cứ nên không có hàm sửa hay xóa (LV-AUD-001).
 *
 * Bảng {@code death_document_records}. Được {@code DeathDocumentIntakeService} (Staff) và
 * {@code LegalDeathVerificationService} (Legal) dùng.
 */
public interface DeathDocumentRecordRepository extends JpaRepository<DeathDocumentRecord, Long> {

    /**
     * Danh sách giấy tờ khai tử của ca, mới nhất trước (phục vụ {@code GET .../death-documents}).
     */
    List<DeathDocumentRecord> findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(
            Long verificationCaseId
    );

    /**
     * Tìm giấy tờ theo UUID công khai trong phạm vi ca.
     */
    Optional<DeathDocumentRecord> findByPublicIdAndVerificationCaseId(UUID publicId, Long verificationCaseId);

    /**
     * Dùng cho luồng Legal quyết định (ST-12): khóa bản ghi để hai quyết định không chạy song song.
     *
     * Khóa ghi bi quan (PESSIMISTIC_WRITE) cho đến hết transaction.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select d
        from DeathDocumentRecord d
        where d.publicId = :publicId
        """)
    Optional<DeathDocumentRecord> findByPublicIdForUpdate(@Param("publicId") UUID publicId);

    /**
     * Tìm giấy tờ theo UUID công khai (không khóa).
     */
    Optional<DeathDocumentRecord> findByPublicId(UUID publicId);
}

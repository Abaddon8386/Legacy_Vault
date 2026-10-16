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
 */
public interface DeathDocumentRecordRepository extends JpaRepository<DeathDocumentRecord, Long> {

    List<DeathDocumentRecord> findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(
            Long verificationCaseId
    );

    Optional<DeathDocumentRecord> findByPublicIdAndVerificationCaseId(UUID publicId, Long verificationCaseId);

    /** Dùng cho luồng Legal quyết định (ST-12): khóa bản ghi để hai quyết định không chạy song song. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select d
        from DeathDocumentRecord d
        where d.publicId = :publicId
        """)
    Optional<DeathDocumentRecord> findByPublicIdForUpdate(@Param("publicId") UUID publicId);
}

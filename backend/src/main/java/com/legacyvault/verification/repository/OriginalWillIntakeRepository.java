package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.OriginalWillIntake;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Chỉ có thêm mới và đọc: bản ghi nộp di chúc gốc là chứng cứ nên không có hàm sửa hay xóa (LV-AUD-001).
 *
 * Bảng {@code original_will_intakes}. Dùng bởi {@code OriginalWillIntakeService} và {@code WillComparisonService}.
 */
public interface OriginalWillIntakeRepository extends JpaRepository<OriginalWillIntake, Long> {

    /**
     * Các lần nhận di chúc gốc của ca, mới nhất trước.
     */
    List<OriginalWillIntake> findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(
            Long verificationCaseId
    );

    /**
     * Tìm lần nhận theo UUID công khai trong phạm vi ca.
     */
    Optional<OriginalWillIntake> findByPublicIdAndVerificationCaseId(UUID publicId, Long verificationCaseId);
}

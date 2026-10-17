package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.OriginalWillIntake;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Chỉ có thêm mới và đọc: bản ghi nộp di chúc gốc là chứng cứ nên không có hàm sửa hay xóa (LV-AUD-001). */
public interface OriginalWillIntakeRepository extends JpaRepository<OriginalWillIntake, Long> {

    List<OriginalWillIntake> findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(
            Long verificationCaseId
    );

    Optional<OriginalWillIntake> findByPublicIdAndVerificationCaseId(UUID publicId, Long verificationCaseId);
}

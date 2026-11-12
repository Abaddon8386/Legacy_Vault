package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisClassificationHistory;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository lịch sử phân loại hồ sơ căn cứ ({@code LegalBasisClassificationHistory}); chỉ ghi thêm, do
 * {@code BasisClassificationService}/{@code BasisReclassificationService}/{@code LegalBasisHoldService} sử dụng.
 */
public interface LegalBasisClassificationHistoryRepository extends JpaRepository<LegalBasisClassificationHistory, Long> {
}

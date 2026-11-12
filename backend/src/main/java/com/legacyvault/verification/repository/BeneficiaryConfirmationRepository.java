package com.legacyvault.verification.repository;
import com.legacyvault.verification.entity.BeneficiaryConfirmationRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
/**
 * Repository Spring Data cho bảng xác nhận của người thụ hưởng ({@code BeneficiaryConfirmationRecord}). Được
 * {@code BeneficiaryReconciliationService}, {@code SignedReceiptService} và {@code BeneficiaryCompletionService} dùng.
 */
public interface BeneficiaryConfirmationRepository extends JpaRepository<BeneficiaryConfirmationRecord,Long> {
    /**
     * Tìm xác nhận theo UUID công khai (dùng khi tải lại file xác nhận).
     */
    java.util.Optional<BeneficiaryConfirmationRecord> findByPublicId(java.util.UUID publicId);
    /**
     * Các xác nhận của một phiên ứng với đúng phiên bản hồ sơ và hash phạm vi phân bổ hiện tại.
     */
    List<BeneficiaryConfirmationRecord> findBySessionIdAndVersionIdAndScopeHash(Long sessionId,Long versionId,String scopeHash);
}

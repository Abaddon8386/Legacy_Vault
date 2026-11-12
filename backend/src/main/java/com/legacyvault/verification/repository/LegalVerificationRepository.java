package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalVerification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Bảng {@code legal_verifications}: các lần Legal thẩm định giấy chứng tử. Dùng bởi
 * {@code LegalDeathVerificationService} và {@code DeathDocumentIntakeService}.
 */
public interface LegalVerificationRepository
        extends JpaRepository<LegalVerification, Long> {

    /**
     * True nếu giấy tờ đã có thẩm định.
     */
    boolean existsByDeathDocumentRecordId(Long deathDocumentRecordId);

    /**
     * Thẩm định của nhiều giấy tờ, mới quyết định trước.
     */
    List<LegalVerification> findByDeathDocumentRecordIdInOrderByDecidedAtDescVerificationIdDesc(List<Long> recordIds);

    /**
     * Lịch sử thẩm định của một giấy tờ, mới yêu cầu trước.
     */
    List<LegalVerification> findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
            Long deathDocumentRecordId
    );
}

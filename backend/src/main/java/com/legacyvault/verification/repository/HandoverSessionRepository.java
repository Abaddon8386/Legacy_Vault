package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Bảng {@code handover_sessions}. Được {@code HandoverSessionService}, {@code HandoverAuthorizationGuard}, các dịch vụ
 * đóng/lưu trữ và {@code GroupHandoverService} dùng.
 */
public interface HandoverSessionRepository extends JpaRepository<HandoverSession, Long> {
    /**
     * True nếu ca có phiên ở trạng thái {@code status} (ví dụ kiểm tra đã có phiên OPEN).
     */
    boolean existsByVerificationCaseIdAndStatus(Long verificationCaseId, HandoverSessionStatus status);

    /**
     * Các phiên của Staff trong ca, mới nhất trước.
     */
    List<HandoverSession> findByVerificationCaseIdAndStaffUserIdOrderByOpenedAtDesc(
            Long verificationCaseId, Long staffUserId);

    /**
     * Như trên nhưng lọc theo trạng thái.
     */
    List<HandoverSession> findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(
            Long verificationCaseId, Long staffUserId, HandoverSessionStatus status);

    /**
     * Tìm phiên theo UUID công khai, bảo đảm thuộc ca và Staff (không khớp thì coi như không tồn tại).
     */
    Optional<HandoverSession> findByPublicIdAndVerificationCaseIdAndStaffUserId(
            UUID publicId, Long verificationCaseId, Long staffUserId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select s from HandoverSession s
        where s.publicId = :publicId and s.verificationCaseId = :caseId and s.staffUserId = :staffId
        """)
    /**
     * Như trên nhưng khóa ghi dòng phiên cho tới hết transaction.
     */
    Optional<HandoverSession> findByPublicIdAndCaseAndStaffForUpdate(
            @Param("publicId") UUID publicId,
            @Param("caseId") Long verificationCaseId,
            @Param("staffId") Long staffUserId);
}

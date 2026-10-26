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

public interface HandoverSessionRepository extends JpaRepository<HandoverSession, Long> {
    boolean existsByVerificationCaseIdAndStatus(Long verificationCaseId, HandoverSessionStatus status);

    List<HandoverSession> findByVerificationCaseIdAndStaffUserIdOrderByOpenedAtDesc(
            Long verificationCaseId, Long staffUserId);

    List<HandoverSession> findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(
            Long verificationCaseId, Long staffUserId, HandoverSessionStatus status);

    Optional<HandoverSession> findByPublicIdAndVerificationCaseIdAndStaffUserId(
            UUID publicId, Long verificationCaseId, Long staffUserId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select s from HandoverSession s
        where s.publicId = :publicId and s.verificationCaseId = :caseId and s.staffUserId = :staffId
        """)
    Optional<HandoverSession> findByPublicIdAndCaseAndStaffForUpdate(
            @Param("publicId") UUID publicId,
            @Param("caseId") Long verificationCaseId,
            @Param("staffId") Long staffUserId);
}

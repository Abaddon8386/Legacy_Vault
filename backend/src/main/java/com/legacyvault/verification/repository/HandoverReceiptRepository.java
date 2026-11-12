package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.HandoverReceipt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Bảng {@code handover_receipts}. Được {@code HandoverReceiptService} dùng cho {@code POST/GET .../receipts}.
 */
public interface HandoverReceiptRepository extends JpaRepository<HandoverReceipt, Long> {
    /**
     * Các biên nhận của phiên, mới nhất trước.
     */
    List<HandoverReceipt> findByHandoverSessionIdOrderByConfirmedAtDesc(Long handoverSessionId);

    /**
     * Tìm biên nhận theo UUID công khai trong phạm vi phiên.
     */
    Optional<HandoverReceipt> findByPublicIdAndHandoverSessionId(UUID publicId, Long handoverSessionId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select r from HandoverReceipt r
        where r.publicId = :publicId and r.handoverSessionId = :sessionId and r.beneficiaryId = :beneficiaryId
        """)
    /**
     * Khóa ghi biên nhận cần bị thay thế (khớp phiên và người thụ hưởng) để tránh hai biên nhận thay thế song song.
     */
    Optional<HandoverReceipt> findForReplacement(@Param("publicId") UUID publicId,
            @Param("sessionId") Long sessionId, @Param("beneficiaryId") Long beneficiaryId);

    /**
     * True nếu biên nhận đã bị một biên nhận khác thay thế.
     */
    boolean existsBySupersedesReceiptId(Long supersedesReceiptId);

    @Query("select b.publicId from HandoverReceipt r, Beneficiary b "
            + "where r.id = :receiptId and b.id = r.beneficiaryId")
    /**
     * UUID công khai của người thụ hưởng trong biên nhận.
     */
    Optional<UUID> findRecipientPublicId(@Param("receiptId") Long receiptId);

    @Query("select b.fullName from HandoverReceipt r, Beneficiary b "
            + "where r.id = :receiptId and b.id = r.beneficiaryId")
    /**
     * Họ tên người thụ hưởng trong biên nhận.
     */
    Optional<String> findRecipientName(@Param("receiptId") Long receiptId);

    @Query("select u.publicId from HandoverReceipt r, User u "
            + "where r.id = :receiptId and u.userId = r.staffUserId")
    /**
     * UUID công khai của Staff lập biên nhận.
     */
    Optional<UUID> findStaffPublicId(@Param("receiptId") Long receiptId);
}

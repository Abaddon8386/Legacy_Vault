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
 * Kho biên nhận bàn giao. Biên nhận không bị sửa tại chỗ: biên nhận thay thế trỏ về biên nhận cũ qua supersedesReceiptId.
 */
public interface HandoverReceiptRepository extends JpaRepository<HandoverReceipt, Long> {
    List<HandoverReceipt> findByHandoverSessionIdOrderByConfirmedAtDesc(Long handoverSessionId);

    Optional<HandoverReceipt> findByPublicIdAndHandoverSessionId(UUID publicId, Long handoverSessionId);

    /**
     * Khóa ghi bi quan biên nhận (đúng phiên, đúng người thụ hưởng) khi tạo biên nhận thay thế, để hai yêu cầu thay thế
     * không chạy song song trên cùng một biên nhận.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select r from HandoverReceipt r
        where r.publicId = :publicId and r.handoverSessionId = :sessionId and r.beneficiaryId = :beneficiaryId
        """)
    Optional<HandoverReceipt> findForReplacement(@Param("publicId") UUID publicId,
            @Param("sessionId") Long sessionId, @Param("beneficiaryId") Long beneficiaryId);

    /**
     * Biên nhận này đã bị biên nhận khác thay thế chưa (dùng để chặn thay thế hai lần).
     */
    boolean existsBySupersedesReceiptId(Long supersedesReceiptId);

    // Ba truy vấn dưới đây tra cứu public UUID/tên của người nhận và Staff theo khóa nội bộ để dựng response mà không nạp cả entity.
    @Query("select b.publicId from HandoverReceipt r, Beneficiary b "
            + "where r.id = :receiptId and b.id = r.beneficiaryId")
    Optional<UUID> findRecipientPublicId(@Param("receiptId") Long receiptId);

    @Query("select b.fullName from HandoverReceipt r, Beneficiary b "
            + "where r.id = :receiptId and b.id = r.beneficiaryId")
    Optional<String> findRecipientName(@Param("receiptId") Long receiptId);

    @Query("select u.publicId from HandoverReceipt r, User u "
            + "where r.id = :receiptId and u.userId = r.staffUserId")
    Optional<UUID> findStaffPublicId(@Param("receiptId") Long receiptId);
}

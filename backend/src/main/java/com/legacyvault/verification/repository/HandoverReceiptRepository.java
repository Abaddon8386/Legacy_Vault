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

public interface HandoverReceiptRepository extends JpaRepository<HandoverReceipt, Long> {
    List<HandoverReceipt> findByHandoverSessionIdOrderByConfirmedAtDesc(Long handoverSessionId);

    Optional<HandoverReceipt> findByPublicIdAndHandoverSessionId(UUID publicId, Long handoverSessionId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select r from HandoverReceipt r
        where r.publicId = :publicId and r.handoverSessionId = :sessionId and r.beneficiaryId = :beneficiaryId
        """)
    Optional<HandoverReceipt> findForReplacement(@Param("publicId") UUID publicId,
            @Param("sessionId") Long sessionId, @Param("beneficiaryId") Long beneficiaryId);

    boolean existsBySupersedesReceiptId(Long supersedesReceiptId);

    @Query("select b.publicId from HandoverReceipt r, Beneficiary b "
            + "where r.id = :receiptId and b.id = r.beneficiaryId")
    Optional<UUID> findRecipientPublicId(@Param("receiptId") Long receiptId);

    @Query("select u.publicId from HandoverReceipt r, User u "
            + "where r.id = :receiptId and u.userId = r.staffUserId")
    Optional<UUID> findStaffPublicId(@Param("receiptId") Long receiptId);
}

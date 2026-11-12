package com.legacyvault.verification.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.legacyvault.verification.entity.HandoverItem;

/**
 * Bảng {@code handover_items}. Được {@code HandoverDeliveryService} dùng cho {@code POST/GET .../deliveries} và
 * {@code .../eligible-assets}.
 */
public interface HandoverItemRepository extends JpaRepository<HandoverItem, Long> {

    /** Allocation lines (of the given ids) that already have a recorded delivery. */
    @Query("select i.allocationId from HandoverItem i where i.allocationId in :allocationIds")
    List<Long> findDeliveredAllocationIds(@Param("allocationIds") Collection<Long> allocationIds);

    @Query("""
        select new com.legacyvault.verification.repository.HandoverItemRow(
            i.publicId, s.publicId, a.publicId, b.publicId, i.status, i.deliveredAt, u.publicId)
        from HandoverItem i, HandoverSession s, Asset a, Beneficiary b, User u
        where i.handoverSessionId = :sessionId
          and s.id = i.handoverSessionId
          and a.assetId = i.assetId
          and b.id = i.beneficiaryId
          and u.userId = i.deliveredByStaffUserId
        order by i.deliveredAt asc, i.id asc
        """)
    /**
     * Các mục đã giao của phiên dạng {@link HandoverItemRow} (UUID công khai), sắp theo thời điểm giao.
     */
    List<HandoverItemRow> findRowsBySession(@Param("sessionId") Long sessionId);
}

package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.HandoverReceiptAsset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface HandoverReceiptAssetRepository extends JpaRepository<HandoverReceiptAsset, Long> {
    List<HandoverReceiptAsset> findByHandoverReceiptIdOrderById(Long handoverReceiptId);

    @Query("""
        select a.publicId from HandoverReceiptAsset item, Asset a
        where item.handoverReceiptId = :receiptId and a.assetId = item.assetId
        order by item.id asc
        """)
    List<java.util.UUID> findAssetPublicIds(@Param("receiptId") Long receiptId);
}

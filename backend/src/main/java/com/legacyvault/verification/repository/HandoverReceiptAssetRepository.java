package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.HandoverReceiptAsset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Bảng nối biên nhận bàn giao với tài sản ({@code HandoverReceiptAsset}); dùng bởi {@code HandoverReceiptService}.
 */
public interface HandoverReceiptAssetRepository extends JpaRepository<HandoverReceiptAsset, Long> {
    /**
     * Các tài sản của một biên nhận theo thứ tự id.
     */
    List<HandoverReceiptAsset> findByHandoverReceiptIdOrderById(Long handoverReceiptId);

    @Query("""
        select a.publicId from HandoverReceiptAsset item, Asset a
        where item.handoverReceiptId = :receiptId and a.assetId = item.assetId
        order by item.id asc
        """)
    /**
     * UUID công khai của các tài sản trong biên nhận (nối với bảng {@code assets}).
     */
    List<java.util.UUID> findAssetPublicIds(@Param("receiptId") Long receiptId);
}

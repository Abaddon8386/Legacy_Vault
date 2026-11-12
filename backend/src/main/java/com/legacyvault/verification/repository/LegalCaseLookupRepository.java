package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Tra cứu ca theo ID công khai cho luồng Legal (không giới hạn theo Staff được gán).
 *
 * Dùng bởi các dịch vụ Legal; repository chỉ-đọc, chỉ khai báo hàm tìm kiếm.
 */
public interface LegalCaseLookupRepository extends Repository<VerificationCase, Long> {

    /**
     * Tìm ca theo UUID công khai.
     */
    @Query("select c from VerificationCase c where c.publicId = :caseId")
    Optional<VerificationCase> findByPublicId(@Param("caseId") UUID caseId);
}

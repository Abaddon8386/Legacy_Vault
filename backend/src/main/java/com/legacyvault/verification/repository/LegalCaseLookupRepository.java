package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Tra cứu ca theo ID công khai cho luồng Legal (không giới hạn theo Staff được gán). */
public interface LegalCaseLookupRepository extends Repository<VerificationCase, Long> {

    @Query("select c from VerificationCase c where c.publicId = :caseId")
    Optional<VerificationCase> findByPublicId(@Param("caseId") UUID caseId);
}

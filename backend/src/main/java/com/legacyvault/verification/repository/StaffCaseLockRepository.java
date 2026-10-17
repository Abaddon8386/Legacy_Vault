package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.VerificationCase;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Điểm kiểm tra "ca thuộc Staff đang đăng nhập" dùng chung cho mọi thao tác ghi nhận của Staff trên một ca
 * (PS-38, PS-39...). Bản có khóa giữ dòng ca tới hết giao dịch để việc ghi nhận không chạy song song với Cancel
 * Alert hủy ca. Ca chưa nhận hoặc của Staff khác đều không tìm thấy (cùng 404, không lộ sự tồn tại).
 */
public interface StaffCaseLockRepository extends Repository<VerificationCase, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId and c.assignedStaffUserId = :staffUserId and c.status = 'OPEN'
        """)
    Optional<VerificationCase> findOpenOwnedByStaffForVaultForUpdate(
            @Param("vaultId") Long vaultId, @Param("staffUserId") Long staffUserId);

    @Query("""
        select c from VerificationCase c
        where c.vaultId = :vaultId and c.assignedStaffUserId = :staffUserId and c.status = 'OPEN'
        """)
    Optional<VerificationCase> findOpenOwnedByStaffForVault(
            @Param("vaultId") Long vaultId, @Param("staffUserId") Long staffUserId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select c from VerificationCase c
        where c.publicId = :caseId
          and c.assignedStaffUserId = :staffUserId
        """)
    Optional<VerificationCase> findOwnedByStaffForUpdate(
            @Param("caseId") UUID caseId,
            @Param("staffUserId") Long staffUserId
    );

    @Query("""
        select c from VerificationCase c
        where c.publicId = :caseId
          and c.assignedStaffUserId = :staffUserId
        """)
    Optional<VerificationCase> findOwnedByStaff(
            @Param("caseId") UUID caseId,
            @Param("staffUserId") Long staffUserId
    );
}

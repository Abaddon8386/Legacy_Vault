package com.legacyvault.verification.repository;
import com.legacyvault.verification.entity.BeneficiaryConfirmationRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BeneficiaryConfirmationRepository extends JpaRepository<BeneficiaryConfirmationRecord,Long> {
    List<BeneficiaryConfirmationRecord> findBySessionIdAndVersionIdAndScopeHash(Long sessionId,Long versionId,String scopeHash);
}

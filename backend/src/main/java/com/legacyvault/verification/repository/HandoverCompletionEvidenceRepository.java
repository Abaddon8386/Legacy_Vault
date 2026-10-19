package com.legacyvault.verification.repository;
import com.legacyvault.verification.entity.HandoverCompletionEvidence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface HandoverCompletionEvidenceRepository extends JpaRepository<HandoverCompletionEvidence,Long>{
 Optional<HandoverCompletionEvidence> findBySessionId(Long sessionId);
}

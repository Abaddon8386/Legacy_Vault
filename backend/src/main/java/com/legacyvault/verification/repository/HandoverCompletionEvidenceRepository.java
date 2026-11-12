package com.legacyvault.verification.repository;
import com.legacyvault.verification.entity.HandoverCompletionEvidence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
/**
 * Repository chứng cứ hoàn tất bàn giao ({@code HandoverCompletionEvidence}); dùng bởi các dịch vụ đóng và lưu trữ phiên.
 */
public interface HandoverCompletionEvidenceRepository extends JpaRepository<HandoverCompletionEvidence,Long>{
 /**
  * Chứng cứ hoàn tất của một phiên bàn giao (nếu đã có).
  */
 Optional<HandoverCompletionEvidence> findBySessionId(Long sessionId);
}

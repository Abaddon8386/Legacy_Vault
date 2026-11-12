package com.legacyvault.trustee;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Repository JPA cho {@code trustee_contact_records}, dùng bởi {@code TrusteeContactService} và {@code CaseContactService}.
 */
public interface TrusteeContactRecordRepository extends JpaRepository<TrusteeContactRecord, Long> {
	/**
	 * Lịch sử liên hệ của một Trustee (theo public id), mới nhất trước.
	 */
	List<TrusteeContactRecord> findAllByTrustee_PublicIdOrderByOccurredAtDesc(UUID trusteePublicId);
}

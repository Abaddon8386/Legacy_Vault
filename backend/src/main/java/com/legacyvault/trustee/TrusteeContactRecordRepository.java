package com.legacyvault.trustee;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrusteeContactRecordRepository extends JpaRepository<TrusteeContactRecord, Long> {
	List<TrusteeContactRecord> findAllByTrustee_PublicIdOrderByOccurredAtDesc(UUID trusteePublicId);
}

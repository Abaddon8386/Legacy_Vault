package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.vault.Vault;
import com.legacyvault.vault.VaultRepository;

@Service
public class DmsTriggerProcessor {

	private final DmsConfigRepository configs;
	private final VaultRepository vaults;
	private final AuditService audit;

	public DmsTriggerProcessor(DmsConfigRepository configs, VaultRepository vaults, AuditService audit) {
		this.configs = configs;
		this.vaults = vaults;
		this.audit = audit;
	}

	@Transactional
	public void triggerIfExpired(Long configId, LocalDateTime now) {
		DmsConfig config = configs.findById(configId).orElse(null);
		if (config == null || !"MONITORING".equals(config.getStatus()) || config.getNextCheckAt() == null
				|| config.getNextCheckAt().isAfter(now)) {
			return;
		}
		LocalDateTime deadline = now.plusDays(config.getGracePeriodDays());
		int updated = configs.triggerIfExpired(configId, now, deadline);
		if (updated != 1) {
			return;
		}
		Vault vault = vaults.findFirstByOwnerUserId(config.getOwnerUserId()).orElse(null);
		audit.record(null, vault == null ? null : vault.getId(), "DMS_TRIGGERED", "DMS_CONFIG", configId, "SYSTEM",
				Map.of("ownerId", config.getOwnerUserId(), "stateBefore", "MONITORING", "stateAfter", "TRIGGERED",
						"graceDeadline", deadline.toString(),
						"stepId", "ST-07", "ruleId", "LV-DEATH-001"));
	}
}

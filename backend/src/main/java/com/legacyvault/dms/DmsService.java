package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.vault.OwnerVaultService;
import com.legacyvault.vault.Vault;

@Service
public class DmsService {

	private final DmsConfigRepository configs;
	private final BeneficiaryRepository beneficiaries;
	private final OwnerVaultService ownerVaults;
	private final OwnerContextService owners;
	private final DmsPolicy policy;
	private final AuditService audit;

	public DmsService(DmsConfigRepository configs, BeneficiaryRepository beneficiaries,
			OwnerVaultService ownerVaults, OwnerContextService owners, DmsPolicy policy, AuditService audit) {
		this.configs = configs;
		this.beneficiaries = beneficiaries;
		this.ownerVaults = ownerVaults;
		this.owners = owners;
		this.policy = policy;
		this.audit = audit;
	}

	@Transactional
	public DmsDtos.Response configure(UUID vaultId, DmsDtos.ConfigureRequest request) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		ownerVaults.requireEditable(vault);
		if (beneficiaries.countByVault_Id(vault.getId()) < 1) {
			throw new BusinessException(ErrorCode.BENEFICIARY_REQUIRED);
		}
		int interval = request.checkIntervalDays();
		if (!policy.allowsInterval(interval)) {
			throw new BusinessException(ErrorCode.VALIDATION_FAILED);
		}
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		DmsConfig config = configs.findByOwnerUserId(owner.getId()).orElse(null);
		String stateBefore = config == null ? null : config.getStatus();
		if (config == null) {
			config = new DmsConfig(owner.getId(), interval, policy.gracePeriodDays(), now.plusDays(interval));
		} else {
			if (!"MONITORING".equals(config.getStatus())) {
				throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
			}
			config.configure(interval, now.plusDays(interval));
		}
		try {
			config = configs.saveAndFlush(config);
		} catch (DataIntegrityViolationException ex) {
			// Handles a concurrent first-time configuration; the database unique constraint is authoritative.
			throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
		}
		audit.record(owner.getId(), vault.getId(), "DMS_CONFIGURED", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", stateBefore == null ? "NOT_CONFIGURED" : stateBefore,
						"stateAfter", "MONITORING", "checkIntervalDays", interval, "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(vault.getPublicId(), config);
	}

	@Transactional(readOnly = true)
	public DmsDtos.Response get(UUID vaultId) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		DmsConfig config = configs.findByOwnerUserId(owner.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		return DmsDtos.Response.from(vault.getPublicId(), config);
	}

	@Transactional
	public DmsDtos.Response checkIn(UUID vaultId) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		DmsConfig config = configs.findByOwnerUserId(owner.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if (!"MONITORING".equals(config.getStatus())) {
			throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
		}
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		config.checkIn(now);
		config = configs.saveAndFlush(config);
		audit.record(owner.getId(), vault.getId(), "DMS_CHECKED_IN", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", "MONITORING", "stateAfter", "MONITORING", "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(vault.getPublicId(), config);
	}
}

package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

@Service
public class DmsService {

	private final DmsConfigRepository configs;
	private final BeneficiaryRepository beneficiaries;
	private final VaultRepository vaults;
	private final VaultService vaultService;
	private final OwnerContextService owners;
	private final DmsPolicy policy;
	private final AuditService audit;

	public DmsService(DmsConfigRepository configs, BeneficiaryRepository beneficiaries,
			VaultRepository vaults, VaultService vaultService, OwnerContextService owners,
			DmsPolicy policy, AuditService audit) {
		this.configs = configs;
		this.beneficiaries = beneficiaries;
		this.vaults = vaults;
		this.vaultService = vaultService;
		this.owners = owners;
		this.policy = policy;
		this.audit = audit;
	}

	@Transactional
	public DmsDtos.Response configure(DmsDtos.ConfigureRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVault(owner.getUserId());
		vaultService.requireEditableVaultForUpdate(vault.getPublicId(), owner.getUserId());
		if (beneficiaries.countByVault_VaultId(vault.getVaultId()) < 1) {
			throw new BusinessException(ErrorCode.BENEFICIARY_REQUIRED);
		}
		int interval = request.checkIntervalDays();
		if (!policy.allowsInterval(interval)) {
			throw new BusinessException(ErrorCode.VALIDATION_FAILED);
		}
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		DmsConfig config = configs.findByOwnerUserIdForUpdate(owner.getUserId()).orElse(null);
		String stateBefore = config == null ? null : config.getStatus();
		if (config == null) {
			config = new DmsConfig(owner.getUserId(), interval, policy.gracePeriodDays(), now.plusDays(interval));
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
		audit.record(owner.getUserId(), vault.getVaultId(), "DMS_CONFIGURED", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", stateBefore == null ? "NOT_CONFIGURED" : stateBefore,
						"stateAfter", "MONITORING", "checkIntervalDays", interval, "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	@Transactional(readOnly = true)
	public DmsDtos.Response get() {
		User owner = owners.requireOwner();
		DmsConfig config = configs.findByOwnerUserId(owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	@Transactional
	public DmsDtos.Response checkIn() {
		User owner = owners.requireOwner();
		Vault vault = ownerVault(owner.getUserId());
		vaultService.requireNotArchivedVaultForUpdate(vault.getPublicId(), owner.getUserId());
		DmsConfig config = configs.findByOwnerUserIdForUpdate(owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if (!"MONITORING".equals(config.getStatus())) {
			throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
		}
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		config.checkIn(now);
		config = configs.saveAndFlush(config);
		Long vaultId = vault.getVaultId();
		audit.record(owner.getUserId(), vaultId, "DMS_CHECKED_IN", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", "MONITORING", "stateAfter", "MONITORING", "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	private Vault ownerVault(Long ownerUserId) {
		return vaults.findByOwnerUserId(ownerUserId, PageRequest.of(0, 1))
				.getContent().stream().findFirst()
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
	}
}

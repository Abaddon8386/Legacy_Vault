package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.UserAccount;
import com.legacyvault.vault.OwnerVaultService;
import com.legacyvault.vault.Vault;

@Service
public class TrusteeService {

	private final TrusteeRepository trustees;
	private final OwnerVaultService ownerVaults;
	private final OwnerContextService owners;
	private final AuditService audit;

	public TrusteeService(TrusteeRepository trustees, OwnerVaultService ownerVaults,
			OwnerContextService owners, AuditService audit) {
		this.trustees = trustees;
		this.ownerVaults = ownerVaults;
		this.owners = owners;
		this.audit = audit;
	}

	@Transactional
	public TrusteeDtos.Response create(TrusteeDtos.CreateRequest request) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(request.vaultId(), owner);
		ownerVaults.requireEditable(vault);
		if (trustees.existsByVault_IdAndStatus(vault.getId(), "ACTIVE")) {
			throw new BusinessException(ErrorCode.TRUSTEE_ALREADY_EXISTS);
		}
		Trustee trustee = new Trustee(vault, clean(request.fullName()), clean(request.phone()),
				cleanEmail(request.email()), clean(request.relationship()), clean(request.note()));
		try {
			trustee = trustees.saveAndFlush(trustee);
		} catch (DataIntegrityViolationException ex) {
			throw new BusinessException(ErrorCode.TRUSTEE_ALREADY_EXISTS);
		}
		audit.record(owner.getId(), vault.getId(), "TRUSTEE_APPOINTED", "TRUSTEE", trustee.getId(), "USER",
				Map.of("stateAfter", "APPOINTED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		return TrusteeDtos.Response.from(trustee);
	}

	@Transactional(readOnly = true)
	public PageEnvelope<TrusteeDtos.Response> current(UUID vaultId) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		List<TrusteeDtos.Response> content = trustees.findFirstByVault_IdAndStatus(vault.getId(), "ACTIVE")
				.map(trustee -> List.of(TrusteeDtos.Response.from(trustee))).orElseGet(List::of);
		return new PageEnvelope<>(content, 0, 1, content.size(), content.isEmpty() ? 0 : 1);
	}

	@Transactional
	public TrusteeDtos.Response update(UUID trusteeId, TrusteeDtos.UpdateRequest request) {
		UserAccount owner = owners.requireOwner();
		Trustee trustee = trustees.findByPublicIdAndVault_OwnerUserId(trusteeId, owner.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if (!"ACTIVE".equals(trustee.getStatus())) {
			throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
		}
		ownerVaults.requireEditable(trustee.getVault());
		trustee.update(clean(request.fullName()), clean(request.phone()), cleanEmail(request.email()),
				clean(request.relationship()), clean(request.note()));
		trustee = trustees.saveAndFlush(trustee);
		audit.record(owner.getId(), trustee.getVault().getId(), "TRUSTEE_UPDATED", "TRUSTEE", trustee.getId(), "USER",
				Map.of("stateAfter", "APPOINTED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		return TrusteeDtos.Response.from(trustee);
	}

	@Transactional
	public TrusteeDtos.Response revoke(UUID trusteeId) {
		UserAccount owner = owners.requireOwner();
		Trustee trustee = trustees.findByPublicIdAndVault_OwnerUserId(trusteeId, owner.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if ("ACTIVE".equals(trustee.getStatus())) {
			ownerVaults.requireEditable(trustee.getVault());
			trustee.revoke(LocalDateTime.now(ZoneOffset.UTC));
			trustees.saveAndFlush(trustee);
			audit.record(owner.getId(), trustee.getVault().getId(), "TRUSTEE_REVOKED", "TRUSTEE", trustee.getId(), "USER",
					Map.of("stateBefore", "APPOINTED", "stateAfter", "REVOKED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		}
		return TrusteeDtos.Response.from(trustee);
	}

	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}

	private String cleanEmail(String value) {
		String cleaned = clean(value);
		return cleaned == null ? null : cleaned.toLowerCase(java.util.Locale.ROOT);
	}
}

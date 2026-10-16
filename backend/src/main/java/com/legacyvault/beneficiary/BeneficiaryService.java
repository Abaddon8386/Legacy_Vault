package com.legacyvault.beneficiary;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.i18n.MessageService;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

@Service
public class BeneficiaryService {

	private final BeneficiaryRepository beneficiaries;
	private final VaultService ownerVaults;
	private final OwnerContextService owners;
	private final IdentityNumberCipher identityCipher;
	private final AuditService audit;
	private final MessageService messages;

	public BeneficiaryService(BeneficiaryRepository beneficiaries, VaultService ownerVaults,
			OwnerContextService owners, IdentityNumberCipher identityCipher, AuditService audit,
			MessageService messages) {
		this.beneficiaries = beneficiaries;
		this.ownerVaults = ownerVaults;
		this.owners = owners;
		this.identityCipher = identityCipher;
		this.audit = audit;
		this.messages = messages;
	}

	@Transactional
	public BeneficiaryDtos.Response create(UUID vaultId, BeneficiaryDtos.UpsertRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireEditableVault(vaultId, owner.getUserId());
		UUID beneficiaryId = UUID.randomUUID();
		byte[] encryptedId = encryptIfPresent(request.identityNumber(), beneficiaryId);
		Beneficiary beneficiary = new Beneficiary(beneficiaryId, vault, clean(request.fullName()), clean(request.relationship()),
				request.dateOfBirth(), clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getUserId(), vault.getVaultId(), "BENEFICIARY_ADDED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	@Transactional(readOnly = true)
	public PageEnvelope<BeneficiaryDtos.Response> list(UUID vaultId, int page, int size) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
		Page<Beneficiary> result = beneficiaries.findAllByVault_VaultId(vault.getVaultId(),
				PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
		return new PageEnvelope<>(result.map(BeneficiaryDtos.Response::from).getContent(), result.getNumber(),
				result.getSize(), result.getTotalElements(), result.getTotalPages());
	}

	@Transactional
	public BeneficiaryDtos.Response update(UUID vaultId, UUID beneficiaryId, BeneficiaryDtos.UpsertRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireEditableVault(vaultId, owner.getUserId());
		Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, vault.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		byte[] encryptedId = encryptIfPresent(request.identityNumber(), beneficiary.getPublicId());
		beneficiary.update(clean(request.fullName()), clean(request.relationship()), request.dateOfBirth(),
				clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getUserId(), vault.getVaultId(), "BENEFICIARY_UPDATED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	@Transactional(readOnly = true)
	public BeneficiaryDtos.ConfigurationCheck configurationCheck(UUID vaultId) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
		long count = beneficiaries.countByVault_VaultId(vault.getVaultId());
		List<BeneficiaryDtos.ConfigurationIssue> issues = count == 0
				? List.of(new BeneficiaryDtos.ConfigurationIssue("BENEFICIARY_REQUIRED", "config.beneficiaryRequired",
						messages.get("config.beneficiaryRequired")))
				: List.of();
		return new BeneficiaryDtos.ConfigurationCheck(vault.getPublicId(), count > 0, count, issues);
	}
	private byte[] encryptIfPresent(String identityNumber, UUID beneficiaryId) {
		String value = clean(identityNumber);
		return value == null ? null : identityCipher.encrypt(value, beneficiaryId);
	}

	private List<String> fields(boolean identityNumberProvided) {
		return identityNumberProvided
				? List.of("fullName", "relationship", "dateOfBirth", "phone", "email", "identityNumber")
				: List.of("fullName", "relationship", "dateOfBirth", "phone", "email");
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

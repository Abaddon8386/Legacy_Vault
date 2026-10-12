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
import com.legacyvault.user.UserAccount;
import com.legacyvault.vault.OwnerVaultService;
import com.legacyvault.vault.Vault;

@Service
public class BeneficiaryService {

	private final BeneficiaryRepository beneficiaries;
	private final OwnerVaultService ownerVaults;
	private final OwnerContextService owners;
	private final IdentityNumberCipher identityCipher;
	private final AuditService audit;
	private final MessageService messages;

	public BeneficiaryService(BeneficiaryRepository beneficiaries, OwnerVaultService ownerVaults,
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
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		ownerVaults.requireEditable(vault);
		byte[] encryptedId = encryptIfPresent(request.identityNumber());
		Beneficiary beneficiary = new Beneficiary(vault, clean(request.fullName()), clean(request.relationship()),
				request.dateOfBirth(), clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getId(), vault.getId(), "BENEFICIARY_ADDED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	@Transactional(readOnly = true)
	public PageEnvelope<BeneficiaryDtos.Response> list(UUID vaultId, int page, int size) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		Page<Beneficiary> result = beneficiaries.findAllByVault_Id(vault.getId(),
				PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
		return new PageEnvelope<>(result.map(BeneficiaryDtos.Response::from).getContent(), result.getNumber(),
				result.getSize(), result.getTotalElements(), result.getTotalPages());
	}

	@Transactional
	public BeneficiaryDtos.Response update(UUID vaultId, UUID beneficiaryId, BeneficiaryDtos.UpsertRequest request) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		ownerVaults.requireEditable(vault);
		Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_Id(beneficiaryId, vault.getId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		byte[] encryptedId = encryptIfPresent(request.identityNumber());
		beneficiary.update(clean(request.fullName()), clean(request.relationship()), request.dateOfBirth(),
				clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getId(), vault.getId(), "BENEFICIARY_UPDATED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	@Transactional(readOnly = true)
	public BeneficiaryDtos.ConfigurationCheck configurationCheck(UUID vaultId) {
		UserAccount owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner);
		long count = beneficiaries.countByVault_Id(vault.getId());
		List<BeneficiaryDtos.ConfigurationIssue> issues = count == 0
				? List.of(new BeneficiaryDtos.ConfigurationIssue("BENEFICIARY_REQUIRED", "config.beneficiaryRequired",
						messages.get("config.beneficiaryRequired")))
				: List.of();
		return new BeneficiaryDtos.ConfigurationCheck(vault.getPublicId(), count > 0, count, issues);
	}
	private byte[] encryptIfPresent(String identityNumber) {
		String value = clean(identityNumber);
		return value == null ? null : identityCipher.encrypt(value);
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

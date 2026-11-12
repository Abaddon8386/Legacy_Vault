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
import jakarta.persistence.EntityManager;

/**
 * Dịch vụ CRUD người thụ hưởng cho chủ kho, gọi từ {@code BeneficiaryController} và {@code VaultConfigurationController}.
 * Bảng {@code beneficiaries}. Ghi dùng khóa Vault (qua {@code VaultService.requireEditableVaultForUpdate}). Số giấy tờ được mã hóa
 * bằng {@code IdentityNumberCipher}. Audit: {@code BENEFICIARY_ADDED}, {@code BENEFICIARY_UPDATED}.
 */
@Service
public class BeneficiaryService {

	private final BeneficiaryRepository beneficiaries;
	private final VaultService ownerVaults;
	private final OwnerContextService owners;
	private final IdentityNumberCipher identityCipher;
	private final AuditService audit;
	private final MessageService messages;
	private final BeneficiaryInvitationService invitations;
	private final EntityManager entities;

	/**
	 * Hàm khởi tạo, Spring tiêm các phụ thuộc.
	 */
	public BeneficiaryService(BeneficiaryRepository beneficiaries, VaultService ownerVaults,
			OwnerContextService owners, IdentityNumberCipher identityCipher, AuditService audit,
			MessageService messages, BeneficiaryInvitationService invitations, EntityManager entities) {
		this.beneficiaries = beneficiaries;
		this.ownerVaults = ownerVaults;
		this.owners = owners;
		this.identityCipher = identityCipher;
		this.audit = audit;
		this.messages = messages;
		this.invitations = invitations;
		this.entities = entities;
	}

	/**
	 * Thêm người thụ hưởng. Các bước: xác thực Owner, khóa Vault có thể sửa, sinh mã công khai, mã hóa số giấy tờ (nếu có)
	 * với AAD là mã công khai, làm sạch dữ liệu, lưu và ghi audit {@code BENEFICIARY_ADDED} (chỉ ghi tên trường, không ghi giá trị).
	 * Endpoint: {@code POST /api/v1/vaults/{vaultId}/beneficiaries}.
	 * @return {@code Response} của bản ghi mới
	 * @throws com.legacyvault.common.error.BusinessException nếu Vault không thuộc Owner hoặc không sửa được
	 */
	@Transactional
	public BeneficiaryDtos.Response create(UUID vaultId, BeneficiaryDtos.UpsertRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireEditableVaultForUpdate(vaultId, owner.getUserId());
		UUID beneficiaryId = UUID.randomUUID();
		byte[] encryptedId = encryptIfPresent(request.identityNumber(), beneficiaryId);
		Beneficiary beneficiary = new Beneficiary(beneficiaryId, vault, clean(request.fullName()), clean(request.relationship()),
				request.dateOfBirth(), clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getUserId(), vault.getVaultId(), "BENEFICIARY_ADDED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	/**
	 * Liệt kê phân trang (mới nhất trước). Endpoint: {@code GET /api/v1/vaults/{vaultId}/beneficiaries}.
	 * @return {@code PageEnvelope} gồm nội dung và thông tin trang
	 */
	@Transactional(readOnly = true)
	public PageEnvelope<BeneficiaryDtos.Response> list(UUID vaultId, int page, int size) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
		Page<Beneficiary> result = beneficiaries.findAllByVault_VaultId(vault.getVaultId(),
				PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
		return new PageEnvelope<>(result.map(BeneficiaryDtos.Response::from).getContent(), result.getNumber(),
				result.getSize(), result.getTotalElements(), result.getTotalPages());
	}

	/**
	 * Cập nhật người thụ hưởng. Refresh bản ghi sau khi giữ khóa Vault, nếu email đổi thì thu hồi lời mời hiện hành,
	 * cập nhật thông tin, lưu và audit {@code BENEFICIARY_UPDATED}. Endpoint: {@code PUT /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}}.
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} nếu không thuộc Vault này
	 */
	@Transactional
	public BeneficiaryDtos.Response update(UUID vaultId, UUID beneficiaryId, BeneficiaryDtos.UpsertRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireEditableVaultForUpdate(vaultId, owner.getUserId());
		Beneficiary beneficiary = beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, vault.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		entities.refresh(beneficiary); // Do not overwrite a link committed while the Vault lock was awaited.
		byte[] encryptedId = encryptIfPresent(request.identityNumber(), beneficiary.getPublicId());
		if (!java.util.Objects.equals(beneficiary.getEmail(), cleanEmail(request.email()))) {
			invitations.revokeForEmailChange(beneficiary, owner.getUserId());
		}
		beneficiary.update(clean(request.fullName()), clean(request.relationship()), request.dateOfBirth(),
				clean(request.phone()), cleanEmail(request.email()), encryptedId);
		beneficiary = beneficiaries.saveAndFlush(beneficiary);
		audit.record(owner.getUserId(), vault.getVaultId(), "BENEFICIARY_UPDATED", "BENEFICIARY", beneficiary.getId(), "USER",
				Map.of("fieldsChanged", fields(request.identityNumber() != null), "stepId", "ST-05"));
		return BeneficiaryDtos.Response.from(beneficiary);
	}

	/**
	 * Kiểm tra cấu hình Vault: yêu cầu ít nhất một người thụ hưởng; nếu thiếu trả issue {@code BENEFICIARY_REQUIRED}.
	 * Endpoint: {@code GET /api/v1/vaults/{vaultId}/configuration-check}.
	 */
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
	/**
	 * Mã hóa số giấy tờ đã làm sạch; trả null nếu trống.
	 */
	private byte[] encryptIfPresent(String identityNumber, UUID beneficiaryId) {
		String value = clean(identityNumber);
		return value == null ? null : identityCipher.encrypt(value, beneficiaryId);
	}

	/**
	 * Danh sách tên trường đã thay đổi để ghi audit.
	 */
	private List<String> fields(boolean identityNumberProvided) {
		return identityNumberProvided
				? List.of("fullName", "relationship", "dateOfBirth", "phone", "email", "identityNumber")
				: List.of("fullName", "relationship", "dateOfBirth", "phone", "email");
	}

	/**
	 * Cắt khoảng trắng; chuỗi rỗng thành null.
	 */
	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}

	/**
	 * Làm sạch rồi đưa email về chữ thường.
	 */
	private String cleanEmail(String value) {
		String cleaned = clean(value);
		return cleaned == null ? null : cleaned.toLowerCase(java.util.Locale.ROOT);
	}
}

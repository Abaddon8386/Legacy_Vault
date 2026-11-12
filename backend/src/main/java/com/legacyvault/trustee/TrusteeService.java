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
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.service.VaultService;

/**
 * Nghiệp vụ Trustee của Owner (ST-04, LV-EXT-001), được {@code TrusteeController} gọi. Bảng {@code trustees}; audit
 * {@code TRUSTEE_APPOINTED}, {@code TRUSTEE_UPDATED}, {@code TRUSTEE_REVOKED}. Mỗi Vault chỉ có tối đa một Trustee APPOINTED.
 */
@Service
public class TrusteeService {

	/**
	 * Truy vấn Trustee.
	 */
	private final TrusteeRepository trustees;
	/**
	 * Kiểm tra ownership / trạng thái Vault.
	 */
	private final VaultService ownerVaults;
	/**
	 * Lấy Owner đang đăng nhập.
	 */
	private final OwnerContextService owners;
	/**
	 * Ghi audit.
	 */
	private final AuditService audit;

	/**
	 * Khởi tạo service với các phụ thuộc do Spring inject.
	 */
	public TrusteeService(TrusteeRepository trustees, VaultService ownerVaults,
			OwnerContextService owners, AuditService audit) {
		this.trustees = trustees;
		this.ownerVaults = ownerVaults;
		this.owners = owners;
		this.audit = audit;
	}

	/**
	 * Bổ nhiệm Trustee ({@code POST /api/v1/trustees}): Vault ACTIVE có khóa ghi; nếu đã có Trustee APPOINTED (hoặc vi phạm unique khi lưu)
	 * -> TRUSTEE_ALREADY_EXISTS. Lưu rồi audit {@code TRUSTEE_APPOINTED}.
	 *
	 * @param request dữ liệu bổ nhiệm
	 * @return {@link TrusteeDtos.Response}
	 * @throws com.legacyvault.common.exception.BusinessException TRUSTEE_ALREADY_EXISTS, RESOURCE_NOT_FOUND hoặc Vault không sửa được
	 */
	@Transactional
	public TrusteeDtos.Response create(TrusteeDtos.CreateRequest request) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireEditableVaultForUpdate(request.vaultId(), owner.getUserId());
		if (trustees.existsByVault_VaultIdAndStatus(vault.getVaultId(), "APPOINTED")) {
			throw new BusinessException(ErrorCode.TRUSTEE_ALREADY_EXISTS);
		}
		Trustee trustee = new Trustee(vault, clean(request.fullName()), clean(request.phone()),
				cleanEmail(request.email()), clean(request.relationship()), clean(request.note()));
		try {
			trustee = trustees.saveAndFlush(trustee);
		} catch (DataIntegrityViolationException ex) {
			throw new BusinessException(ErrorCode.TRUSTEE_ALREADY_EXISTS);
		}
		audit.record(owner.getUserId(), vault.getVaultId(), "TRUSTEE_APPOINTED", "TRUSTEE", trustee.getId(), "USER",
				Map.of("stateAfter", "APPOINTED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		return TrusteeDtos.Response.from(trustee);
	}

	/**
	 * Trustee hiện tại của Vault ({@code GET /api/v1/trustees?vaultId=}); kết quả là trang 0 phần tử hoặc 1 phần tử.
	 *
	 * @param vaultId public id Vault
	 * @return {@link PageEnvelope} chứa Trustee APPOINTED nếu có
	 */
	@Transactional(readOnly = true)
	public PageEnvelope<TrusteeDtos.Response> current(UUID vaultId) {
		User owner = owners.requireOwner();
		Vault vault = ownerVaults.requireOwnedVault(vaultId, owner.getUserId());
		List<TrusteeDtos.Response> content = trustees.findFirstByVault_VaultIdAndStatus(vault.getVaultId(), "APPOINTED")
				.map(trustee -> List.of(TrusteeDtos.Response.from(trustee))).orElseGet(List::of);
		return new PageEnvelope<>(content, 0, 1, content.size(), content.isEmpty() ? 0 : 1);
	}

	/**
	 * Cập nhật Trustee ({@code PUT /api/v1/trustees/{trusteeId}}). Chỉ Trustee APPOINTED mới sửa được (đã REVOKED -> VAULT_NOT_EDITABLE); audit {@code TRUSTEE_UPDATED}.
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND, VAULT_NOT_EDITABLE
	 */
	@Transactional
	public TrusteeDtos.Response update(UUID trusteeId, TrusteeDtos.UpdateRequest request) {
		User owner = owners.requireOwner();
		Trustee trustee = trustees.findByPublicIdAndVault_OwnerUserId(trusteeId, owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if (!"APPOINTED".equals(trustee.getStatus())) {
			throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
		}
		ownerVaults.requireEditableVaultForUpdate(trustee.getVault().getPublicId(), owner.getUserId());
		trustee.update(clean(request.fullName()), clean(request.phone()), cleanEmail(request.email()),
				clean(request.relationship()), clean(request.note()));
		trustee = trustees.saveAndFlush(trustee);
		audit.record(owner.getUserId(), trustee.getVault().getVaultId(), "TRUSTEE_UPDATED", "TRUSTEE", trustee.getId(), "USER",
				Map.of("stateAfter", "APPOINTED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		return TrusteeDtos.Response.from(trustee);
	}

	/**
	 * Thu hồi Trustee ({@code POST /api/v1/trustees/{trusteeId}/revoke}). Idempotent: nếu đã REVOKED thì trả về nguyên trạng; nếu APPOINTED thì Vault phải sửa được, đặt REVOKED và audit {@code TRUSTEE_REVOKED}.
	 *
	 * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND
	 */
	@Transactional
	public TrusteeDtos.Response revoke(UUID trusteeId) {
		User owner = owners.requireOwner();
		Trustee trustee = trustees.findByPublicIdAndVault_OwnerUserId(trusteeId, owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if ("APPOINTED".equals(trustee.getStatus())) {
			ownerVaults.requireEditableVaultForUpdate(trustee.getVault().getPublicId(), owner.getUserId());
			trustee.revoke(LocalDateTime.now(ZoneOffset.UTC));
			trustees.saveAndFlush(trustee);
			audit.record(owner.getUserId(), trustee.getVault().getVaultId(), "TRUSTEE_REVOKED", "TRUSTEE", trustee.getId(), "USER",
					Map.of("stateBefore", "APPOINTED", "stateAfter", "REVOKED", "stepId", "ST-04", "ruleId", "LV-EXT-001"));
		}
		return TrusteeDtos.Response.from(trustee);
	}

	/**
	 * Trim; null hoặc rỗng trả về null.
	 */
	private String clean(String value) {
		if (value == null) return null;
		String cleaned = value.trim();
		return cleaned.isEmpty() ? null : cleaned;
	}

	/**
	 * Trim rồi chuyển email về chữ thường (Locale.ROOT); rỗng trả về null.
	 */
	private String cleanEmail(String value) {
		String cleaned = clean(value);
		return cleaned == null ? null : cleaned.toLowerCase(java.util.Locale.ROOT);
	}
}

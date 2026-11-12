package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.will.repository.WillAssetRepository;
import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.OwnerContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.vault.service.VaultService;

/**
 * Nghiệp vụ DMS cho chủ két, được {@link DmsController} gọi cho {@code PUT /api/v1/dms}, {@code GET /api/v1/dms}
 * và {@code POST /api/v1/dms/check-in}. Làm việc với các bảng {@code dms_configs} ({@link DmsConfigRepository}),
 * {@code vaults}, tài sản, di chúc và người thụ hưởng; ghi audit qua {@code workflowAuditService}
 * ({@code DMS_CONFIGURED}, {@code DMS_CHECKED_IN}). Người dùng hiện tại lấy từ {@link OwnerContextService}.
 */
@Service
public class DmsService {

	/** Repository cấu hình DMS. */
	private final DmsConfigRepository configs;
	/** Đếm người thụ hưởng của két (điều kiện bắt buộc để cấu hình). */
	private final BeneficiaryRepository beneficiaries;
	/** Kiểm tra két có ít nhất một tài sản (không tính tài liệu). */
	private final AssetRepository assetRepository;
	/** Kiểm tra két có ít nhất một di chúc. */
	private final WillAssetRepository willAssetRepository;
	/** Tìm két của chủ sở hữu. */
	private final VaultRepository vaults;
	/** Khóa và kiểm tra trạng thái két (có sửa được / chưa lưu trữ) trước khi ghi. */
	private final VaultService vaultService;
	/** Lấy chủ két đang đăng nhập. */
	private final OwnerContextService owners;
	/** Chính sách giới hạn chu kỳ/gia hạn. */
	private final DmsPolicy policy;
	/** Ghi audit nghiệp vụ. */
	private final AuditService audit;

	/** Nhận các repository và service phụ thuộc. */
	public DmsService(DmsConfigRepository configs, BeneficiaryRepository beneficiaries,
			AssetRepository assetRepository, WillAssetRepository willAssetRepository,
			VaultRepository vaults, VaultService vaultService, OwnerContextService owners,
			DmsPolicy policy, AuditService audit) {
		this.configs = configs;
		this.beneficiaries = beneficiaries;
		this.assetRepository = assetRepository;
		this.willAssetRepository = willAssetRepository;
		this.vaults = vaults;
		this.vaultService = vaultService;
		this.owners = owners;
		this.policy = policy;
		this.audit = audit;
	}

	/**
	 * ST-06: cấu hình DMS của chủ két đang đăng nhập (endpoint {@code PUT /api/v1/dms}).
	 *
	 * <p>Các bước: xác định chu kỳ/gia hạn bằng {@link DmsPolicy}; tải két của chủ và khóa nó
	 * ({@code requireEditableVaultForUpdate}); yêu cầu két có ít nhất một tài sản (không phải tài liệu), một di chúc và
	 * một người thụ hưởng; khóa ghi dòng {@code dms_configs}; tạo mới hoặc cấu hình lại (chỉ khi đang
	 * {@code MONITORING}; nếu chỉ đổi gia hạn thì giữ nguyên chu kỳ check-in); lưu và ghi audit {@code DMS_CONFIGURED}
	 * (step ST-06, rule LV-DEATH-001).
	 *
	 * @param request request cấu hình
	 * @return cấu hình sau khi lưu
	 * @throws BusinessException {@code VALIDATION_FAILED} (chu kỳ/gia hạn sai), {@code RESOURCE_NOT_FOUND} (chưa có két),
	 *         {@code ASSET_REQUIRED}, {@code WILL_REQUIRED}, {@code BENEFICIARY_REQUIRED},
	 *         {@code DMS_NOT_MONITORING} (đang không ở trạng thái theo dõi hoặc vi phạm unique do cấu hình đồng thời),
	 *         cùng các lỗi từ kiểm tra két
	 */
	@Transactional
	public DmsDtos.Response configure(DmsDtos.ConfigureRequest request) {
		User owner = owners.requireOwner();
		int interval = policy.resolveMinutes(request);
		Integer graceMinutes = policy.resolveGraceMinutes(request);
		Vault vault = ownerVault(owner.getUserId());
		vaultService.requireEditableVaultForUpdate(vault.getPublicId(), owner.getUserId());
		if (assetRepository.findByVaultIdAndAssetTypeNot(vault.getVaultId(), AssetType.DOCUMENT, PageRequest.of(0, 1)).getTotalElements() < 1) {
			throw new BusinessException(ErrorCode.ASSET_REQUIRED);
		}
		if (willAssetRepository.findWills(vault.getVaultId(), PageRequest.of(0, 1)).getTotalElements() < 1) {
			throw new BusinessException(ErrorCode.WILL_REQUIRED);
		}
		if (beneficiaries.countByVault_VaultId(vault.getVaultId()) < 1) {
			throw new BusinessException(ErrorCode.BENEFICIARY_REQUIRED);
		}
		LocalDateTime now = DmsConfig.utcNow();
		DmsConfig config = configs.findByOwnerUserIdForUpdate(owner.getUserId()).orElse(null);
		String stateBefore = config == null ? null : config.getStatus();
		if (config == null) {
			config = DmsConfig.withGraceMinutes(owner.getUserId(), interval,
					graceMinutes != null ? graceMinutes : policy.gracePeriodMinutes(), now.plusMinutes(interval));
		} else {
			if (!"MONITORING".equals(config.getStatus())) {
				throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
			}
			boolean graceOnly = graceMinutes != null && config.getCheckIntervalMinutes() == interval;
			if (!graceOnly) config.configureMinutes(interval, now.plusMinutes(interval));
			if (graceMinutes != null) config.setGraceMinutes(graceMinutes);
		}
		try {
			config = configs.saveAndFlush(config);
		} catch (DataIntegrityViolationException ex) {
			// Xử lý trường hợp hai request cấu hình lần đầu đồng thời; ràng buộc unique của DB là căn cứ quyết định.
			throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
		}
		audit.record(owner.getUserId(), vault.getVaultId(), "DMS_CONFIGURED", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", stateBefore == null ? "NOT_CONFIGURED" : stateBefore,
						"stateAfter", "MONITORING", "checkIntervalMinutes", interval, "gracePeriodMinutes", config.getGracePeriodMinutes(), "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	/**
	 * Lấy cấu hình DMS của chủ két đang đăng nhập ({@code GET /api/v1/dms}).
	 *
	 * @return cấu hình hiện tại
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu chưa cấu hình
	 */
	@Transactional(readOnly = true)
	public DmsDtos.Response get() {
		User owner = owners.requireOwner();
		DmsConfig config = configs.findByOwnerUserId(owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	/** Check-in tại thời điểm hiện tại ({@code POST /api/v1/dms/check-in}); xem {@link #checkInAt}. */
	@Transactional
	public DmsDtos.Response checkIn() {
		return checkInAt(null);
	}

	/**
	 * Thực hiện check-in (ST-06): khóa két (không được đã lưu trữ) rồi khóa dòng DMS; chấp nhận khi đang
	 * {@code MONITORING} hoặc đang {@code TRIGGERED} nhưng còn trong thời gian gia hạn và két còn {@code ACTIVE}
	 * (khi đó hủy cảnh báo). Cập nhật mốc check-in, lưu và ghi audit {@code DMS_CHECKED_IN}.
	 *
	 * @param requestedAt giờ dùng làm "bây giờ" (cho kiểm thử), null thì lấy giờ UTC hiện tại
	 * @return cấu hình sau khi check-in
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} (chưa có két/cấu hình), {@code VAULT_NOT_EDITABLE} (két đã
	 *         lưu trữ) hoặc {@code DMS_NOT_MONITORING}
	 */
	DmsDtos.Response checkInAt(LocalDateTime requestedAt) {
		User owner = owners.requireOwner();
		Vault vault = ownerVault(owner.getUserId());
		vaultService.requireNotArchivedVaultForUpdate(vault.getPublicId(), owner.getUserId());
		DmsConfig config = configs.findByOwnerUserIdForUpdate(owner.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		LocalDateTime now = requestedAt == null ? DmsConfig.utcNow() : requestedAt;
		boolean monitoring = DmsConfig.STATUS_MONITORING.equals(config.getStatus());
		boolean withinGrace = DmsConfig.STATUS_TRIGGERED.equals(config.getStatus())
				&& config.getGraceDeadline() != null
				&& config.getGraceDeadline().isAfter(now)
				&& Vault.STATUS_ACTIVE.equals(vault.getStatus());
		if (!monitoring && !withinGrace) {
			throw new BusinessException(ErrorCode.DMS_NOT_MONITORING);
		}
		String stateBefore = config.getStatus();
		if (withinGrace) config.restoreAfterAlert(now);
		else config.checkIn(now);
		config = configs.saveAndFlush(config);
		Long vaultId = vault.getVaultId();
		audit.record(owner.getUserId(), vaultId, "DMS_CHECKED_IN", "DMS_CONFIG", config.getId(), "USER",
				Map.of("stateBefore", stateBefore, "stateAfter", "MONITORING", "stepId", "ST-06", "ruleId", "LV-DEATH-001"));
		return DmsDtos.Response.from(owner.getPublicId(), config);
	}

	/**
	 * Lấy két (đầu tiên) của chủ sở hữu.
	 *
	 * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu chủ chưa có két
	 */
	private Vault ownerVault(Long ownerUserId) {
		return vaults.findByOwnerUserId(ownerUserId, PageRequest.of(0, 1))
				.getContent().stream().findFirst()
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
	}
}

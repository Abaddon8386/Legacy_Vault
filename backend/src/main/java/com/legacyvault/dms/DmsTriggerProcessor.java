package com.legacyvault.dms;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

@Service
public class DmsTriggerProcessor {

	private final DmsConfigRepository configs;
	private final VaultRepository vaults;
	private final VerificationCaseRepository verificationCases;
	private final AuditService audit;
	private final com.legacyvault.verification.service.LegalBasisLockedState state;

	public DmsTriggerProcessor(
			DmsConfigRepository configs,
			VaultRepository vaults,
			VerificationCaseRepository verificationCases,
			AuditService audit,
			com.legacyvault.verification.service.LegalBasisLockedState state
	) {
		this.configs = configs;
		this.vaults = vaults;
		this.verificationCases = verificationCases;
		this.audit = audit;
		this.state = state;
	}

	/**
	 * ST-07: MONITORING -> TRIGGERED.
	 * Giữ nguyên hành vi nghiệp vụ đã có.
	 */
	@Transactional
	public void triggerIfExpired(Long configId, LocalDateTime now) {
		DmsConfig config = configs.findById(configId).orElse(null);

		if (config == null
				|| !"MONITORING".equals(config.getStatus())
				|| config.getNextCheckAt() == null
				|| config.getNextCheckAt().isAfter(now)) {
			return;
		}

		// Same Vault -> DMS order as archive/cancel; check fresh state before business writes or log INSERTs.
		Vault vault = vaults.findByOwnerUserIdForUpdate(config.getOwnerUserId()).orElse(null);
		if (vault != null) {
			state.refresh(vault);
			if (Vault.STATUS_ARCHIVED.equals(vault.getStatus())) return;
		}
		LocalDateTime deadline = now.plusMinutes(config.getGracePeriodMinutes());

		int updated = configs.triggerIfExpired(configId, now, deadline);
		if (updated != 1) {
			return;
		}

		audit.record(null,
				vault == null ? null : vault.getVaultId(),
				"DMS_TRIGGERED",
				"DMS_CONFIG",
				configId,
				"SYSTEM",
				Map.of(
						"ownerId", config.getOwnerUserId(),
						"stateBefore", "MONITORING",
						"stateAfter", "TRIGGERED",
						"graceDeadline", deadline.toString(),
						"stepId", "ST-07",
						"ruleId", "LV-DEATH-001"
				)
		);
	}

	/**
	 * ST-08/ST-09:
	 * Hết Grace Period -> GRACE_PERIOD_EXCEEDED
	 * -> tạo Verification Case -> Vault AWAITING_VERIFICATION.
	 *
	 * Toàn bộ thao tác nằm trong cùng transaction.
	 */
	@Transactional
	public void processGracePeriodExpired(Long configId, LocalDateTime now) {
		DmsConfig snapshot = configs.findById(configId).orElse(null);

		if (snapshot == null || !snapshot.isGracePeriodExpired(now)) {
			return;
		}

		/*
		 * Khóa Vault trước rồi khóa DMS để đồng bộ thứ tự khóa
		 * với luồng Cancel Alert của VaultService.
		 */
		Vault vault = vaults
				.findByOwnerUserIdForUpdate(snapshot.getOwnerUserId())
				.orElse(null);

		if (vault == null) {
			return;
		}
		state.refresh(vault);

		DmsConfig config = configs.findByIdForUpdate(configId).orElse(null);
		if (config != null) state.refresh(config);

		if (config == null || !config.isGracePeriodExpired(now)) {
			return;
		}

		/*
		 * Chỉ chuyển Vault ACTIVE sang AWAITING_VERIFICATION.
		 * Không tự ý thay đổi trạng thái đã được luồng khác xử lý.
		 */
		if (!vault.canEnterVerification()) {
			return;
		}

		if (verificationCases.existsByVaultIdAndStatus(
				vault.getVaultId(), VerificationCase.STATUS_OPEN)) {
			return;
		}

		LocalDateTime triggeredAt = config.getGraceDeadline();

		// ST-08: DMS xác nhận hết Grace Period, không xác nhận tử vong.
		config.markGracePeriodExceeded(now);

		// ST-09: Mở vụ việc xác minh; chưa có Staff được phân công.
		VerificationCase verificationCase = new VerificationCase(vault.getVaultId(), triggeredAt, null);

		verificationCases.saveAndFlush(verificationCase);

		// Chuyển trạng thái Vault trong cùng transaction.
		vault.markAwaitingVerification();

		configs.saveAndFlush(config);
		vaults.saveAndFlush(vault);

		audit.record(
				null,
				vault.getVaultId(),
				"DMS_GRACE_PERIOD_EXCEEDED",
				"DMS_CONFIG",
				configId,
				"SYSTEM",
				Map.of(
						"ownerId", config.getOwnerUserId(),
						"stateBefore", "TRIGGERED",
						"stateAfter", "GRACE_PERIOD_EXCEEDED",
						"graceDeadline", triggeredAt.toString(),
						"stepId", "ST-08",
						"ruleId", "LV-DEATH-001"
				)
		);

		audit.record(
				null,
				vault.getVaultId(),
				"VERIFICATION_CASE_CREATED",
				"VERIFICATION_CASE",
				verificationCase.getVerificationCaseId(),
				"SYSTEM",
				Map.of(
						"vaultStateBefore", "ACTIVE",
						"vaultStateAfter", "AWAITING_VERIFICATION",
						"caseStatus", VerificationCase.STATUS_OPEN,
						"stepId", "ST-09",
						"ruleId", "LV-DEATH-001"
				)
		);
	}
}

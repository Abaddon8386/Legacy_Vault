package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

import jakarta.validation.Valid;

/**
 * PS-62 / PS-63 (ST-24): chỉ Staff Executor, và chỉ với hồ sơ họ sở hữu (kiểm tra trong service).
 * BE-01: hai route này nhận email/credential do client gửi và liên kết ngay trong cùng lời gọi, qua mặt
 * luồng yêu cầu của người nhận + Staff xác nhận. Chúng trả 410 trừ khi
 * {@code legacyvault.beneficiary.legacy-counter-link-enabled=true} (mặc định false; chỉ cho migration/test).
 */
@Validated
@RestController
@RequestMapping("/api/v1/staff/beneficiaries/{beneficiaryId}")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffBeneficiaryAccountController {

	private final BeneficiaryAccountService service;

	private final boolean legacyEnabled;

	public StaffBeneficiaryAccountController(BeneficiaryAccountService service,
			@Value("${legacyvault.beneficiary.legacy-counter-link-enabled:false}") boolean legacyEnabled) {
		this.service = service;
		this.legacyEnabled = legacyEnabled;
	}

	/** Chặn các route cũ khi cờ cấu hình tắt (mặc định tắt), trả mã BENEFICIARY_LEGACY_LINK_DISABLED. */
	private void requireLegacyEnabled() {
		if (!legacyEnabled) throw new BusinessException(ErrorCode.BENEFICIARY_LEGACY_LINK_DISABLED);
	}

	@PostMapping("/account-link")
	public BeneficiaryAccountDtos.Response link(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryAccountDtos.LinkRequest request) {
		requireLegacyEnabled();
		return service.link(beneficiaryId, request);
	}

	@PostMapping("/account")
	public ResponseEntity<BeneficiaryAccountDtos.Response> create(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody BeneficiaryAccountDtos.CreateRequest request) {
		requireLegacyEnabled();
		var response = service.create(beneficiaryId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/beneficiaries/" + beneficiaryId + "/account"))
				.body(response);
	}
}

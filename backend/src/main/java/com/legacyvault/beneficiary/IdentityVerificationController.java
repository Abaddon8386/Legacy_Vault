package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/**
 * Controller xác minh danh tính người thụ hưởng tại quầy (ST-14). Đường dẫn gốc
 * {@code /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications}; yêu cầu {@code ROLE_STAFF_EXECUTOR}.
 * Phía frontend, {@code pages/staff/staffIdentityService.js} hiện mới chạy chế độ mô phỏng và chưa gọi các endpoint này.
 */
@Validated
@RestController
@RequestMapping("/api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class IdentityVerificationController {

	private final IdentityVerificationService service;

	/**
	 * Hàm khởi tạo, nhận {@code IdentityVerificationService}.
	 */
	public IdentityVerificationController(IdentityVerificationService service) { this.service = service; }

	/**
	 * {@code POST /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications}: ghi kết quả xác minh (MATCH hoặc NOT_MATCH).
	 * @param request {@code IdentityVerificationDtos.Request}
	 * @return HTTP 201 kèm Location và {@code IdentityVerificationDtos.Response}
	 */
	@PostMapping
	public ResponseEntity<IdentityVerificationDtos.Response> verify(@PathVariable UUID beneficiaryId,
			@Valid @RequestBody IdentityVerificationDtos.Request request) {
		var response = service.verify(beneficiaryId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/beneficiaries/" + beneficiaryId
				+ "/identity-verifications/" + response.id())).body(response);
	}

	/**
	 * {@code GET /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications}: lịch sử xác minh, mới nhất trước.
	 * @return danh sách {@code IdentityVerificationDtos.Response}
	 */
	@GetMapping
	public List<IdentityVerificationDtos.Response> history(@PathVariable UUID beneficiaryId) {
		return service.history(beneficiaryId);
	}
}

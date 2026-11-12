package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
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
 * BE-01: counter confirmation of link requests and unlinked account creation; Staff Executor on an owned case only.
 *
 * <p>Đường dẫn gốc {@code /api/v1/staff/verification-cases/{caseId}}; yêu cầu {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho
 * {@code StaffLinkRequestService} và {@code StaffAccountProvisioningService}. Phản hồi {@code no-store}.
 */
@Validated
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffLinkRequestController {

	private final StaffLinkRequestService linkRequests;
	private final StaffAccountProvisioningService provisioning;

	/**
	 * Hàm khởi tạo, nhận hai dịch vụ.
	 */
	public StaffLinkRequestController(StaffLinkRequestService linkRequests, StaffAccountProvisioningService provisioning) {
		this.linkRequests = linkRequests;
		this.provisioning = provisioning;
	}

	/**
	 * {@code POST /api/v1/staff/verification-cases/{caseId}/accounts}: tạo tài khoản chưa liên kết tại quầy. Body {@code CreateAccountRequest}.
	 * @return HTTP 201 với {@code CreatedAccount}
	 */
	@PostMapping("/accounts")
	public ResponseEntity<BeneficiaryLinkRequestDtos.CreatedAccount> createAccount(@PathVariable UUID caseId,
			@Valid @RequestBody BeneficiaryLinkRequestDtos.CreateAccountRequest request) {
		var created = provisioning.createUnlinked(caseId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/verification-cases/" + caseId + "/accounts"))
				.cacheControl(CacheControl.noStore()).body(created);
	}

	/**
	 * {@code GET /api/v1/staff/verification-cases/{caseId}/link-requests}: liệt kê yêu cầu liên kết đang chờ của case.
	 * @return danh sách {@code StaffRequest}
	 */
	@GetMapping("/link-requests")
	public ResponseEntity<List<BeneficiaryLinkRequestDtos.StaffRequest>> list(@PathVariable UUID caseId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(linkRequests.listPending(caseId));
	}

	/**
	 * {@code POST .../link-requests/{requestId}/approve}: duyệt yêu cầu và liên kết tài khoản với người thụ hưởng được chọn. Body {@code ApproveRequest}.
	 * @return {@code Decision}
	 */
	@PostMapping("/link-requests/{requestId}/approve")
	public ResponseEntity<BeneficiaryLinkRequestDtos.Decision> approve(@PathVariable UUID caseId,
			@PathVariable UUID requestId, @Valid @RequestBody BeneficiaryLinkRequestDtos.ApproveRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(linkRequests.approve(caseId, requestId, request.beneficiaryId()));
	}

	/**
	 * {@code POST .../link-requests/{requestId}/reject}: từ chối yêu cầu.
	 * @return {@code Decision} với {@code beneficiaryId} và {@code accountId} là null
	 */
	@PostMapping("/link-requests/{requestId}/reject")
	public ResponseEntity<BeneficiaryLinkRequestDtos.Decision> reject(@PathVariable UUID caseId,
			@PathVariable UUID requestId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(linkRequests.reject(caseId, requestId));
	}
}

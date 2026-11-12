package com.legacyvault.beneficiary;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.security.CustomUserPrincipal;

import jakarta.validation.Valid;

/**
 * BE-01: any signed-in account (a Beneficiary role is not required) manages its own link requests.
 *
 * Controller phía người nhận: gửi, xem và hủy yêu cầu liên kết (BE-01). Đường dẫn gốc {@code /api/v1/beneficiary-link-requests};
 * yêu cầu đã đăng nhập ({@code isAuthenticated()}). Tài khoản luôn lấy từ {@code CustomUserPrincipal}, không từ body. Phản hồi {@code no-store}.
 */
@RestController
@RequestMapping("/api/v1/beneficiary-link-requests")
@PreAuthorize("isAuthenticated()")
public class BeneficiaryLinkRequestController {

	private final BeneficiaryLinkRequestService service;

	/**
	 * Hàm khởi tạo, nhận {@code BeneficiaryLinkRequestService}.
	 */
	public BeneficiaryLinkRequestController(BeneficiaryLinkRequestService service) { this.service = service; }

	/**
	 * {@code POST /api/v1/beneficiary-link-requests}: gửi yêu cầu liên kết bằng mã hồ sơ.
	 * @param request {@code BeneficiaryLinkRequestDtos.SubmitRequest} chứa {@code caseCode}
	 * @param principal tài khoản đang đăng nhập
	 * @return HTTP 201 kèm Location và {@code MyRequest}
	 */
	@PostMapping
	public ResponseEntity<BeneficiaryLinkRequestDtos.MyRequest> submit(
			@Valid @RequestBody BeneficiaryLinkRequestDtos.SubmitRequest request,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		var created = service.submit(CustomUserPrincipal.requireUserId(principal), request.caseCode());
		return ResponseEntity.created(URI.create("/api/v1/beneficiary-link-requests/" + created.requestId()))
				.cacheControl(CacheControl.noStore()).body(created);
	}

	/**
	 * {@code GET /api/v1/beneficiary-link-requests}: liệt kê các yêu cầu của chính tài khoản, mới nhất trước.
	 * @return HTTP 200 với danh sách {@code MyRequest}
	 */
	@GetMapping
	public ResponseEntity<List<BeneficiaryLinkRequestDtos.MyRequest>> listMine(
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(service.listMine(CustomUserPrincipal.requireUserId(principal)));
	}

	/**
	 * {@code POST /api/v1/beneficiary-link-requests/{requestId}/cancel}: hủy yêu cầu đang chờ của chính mình.
	 * @return HTTP 200 với {@code MyRequest} sau khi hủy
	 */
	@PostMapping("/{requestId}/cancel")
	public ResponseEntity<BeneficiaryLinkRequestDtos.MyRequest> cancel(@PathVariable UUID requestId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(service.cancel(CustomUserPrincipal.requireUserId(principal), requestId));
	}
}

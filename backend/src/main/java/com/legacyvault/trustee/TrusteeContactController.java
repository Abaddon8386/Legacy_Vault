package com.legacyvault.trustee;

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
 * Controller Staff ghi và xem lịch sử kết quả liên hệ với Trustee (ST-10, LV-EXT-001).
 *
 * Base path {@code /api/v1/staff/trustees/{trusteeId}/contact-outcomes}; yêu cầu authority {@code ROLE_STAFF_EXECUTOR}.
 * Nghiệp vụ nằm ở {@link TrusteeContactService}.
 */
@Validated
@RestController
@RequestMapping("/api/v1/staff/trustees/{trusteeId}/contact-outcomes")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class TrusteeContactController {

	/**
	 * Service ghi / đọc kết quả liên hệ.
	 */
	private final TrusteeContactService service;

	/**
	 * Khởi tạo controller.
	 *
	 * @param service service liên hệ Trustee
	 */
	public TrusteeContactController(TrusteeContactService service) {
		this.service = service;
	}

	/**
	 * {@code POST /api/v1/staff/trustees/{trusteeId}/contact-outcomes} - ghi một kết quả liên hệ Trustee (role STAFF_EXECUTOR).
	 * Body {@link TrusteeContactDtos.RecordRequest}; trả 201 Created kèm {@link TrusteeContactDtos.RecordResponse} và header {@code Location}.
	 *
	 * @param trusteeId public id của Trustee
	 */
	@PostMapping
	public ResponseEntity<TrusteeContactDtos.RecordResponse> record(@PathVariable UUID trusteeId,
			@Valid @RequestBody TrusteeContactDtos.RecordRequest request) {
		TrusteeContactDtos.RecordResponse response = service.record(trusteeId, request);
		return ResponseEntity.created(URI.create("/api/v1/staff/trustees/" + trusteeId
				+ "/contact-outcomes/" + response.id())).body(response);
	}

	/**
	 * {@code GET /api/v1/staff/trustees/{trusteeId}/contact-outcomes} - lịch sử liên hệ Trustee, mới nhất trước (role STAFF_EXECUTOR).
	 *
	 * @return danh sách {@link TrusteeContactDtos.RecordResponse}
	 */
	@GetMapping
	public List<TrusteeContactDtos.RecordResponse> history(@PathVariable UUID trusteeId) {
		return service.history(trusteeId);
	}
}

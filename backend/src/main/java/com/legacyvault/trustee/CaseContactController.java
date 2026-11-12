package com.legacyvault.trustee;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller chỉ-đọc dành cho Staff: thông tin liên hệ của những người cần liên lạc trên một hồ sơ xác minh đang OPEN được giao cho mình.
 *
 * Base path {@code /api/v1/staff/verification-cases/{caseId}/contacts}; yêu cầu authority {@code ROLE_STAFF_EXECUTOR}.
 * Nghiệp vụ nằm ở {@link CaseContactService}.
 */
@RestController
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/contacts")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class CaseContactController {

	/**
	 * Service đọc thông tin liên hệ hồ sơ.
	 */
	private final CaseContactService service;

	/**
	 * Khởi tạo controller.
	 *
	 * @param service service đọc liên hệ
	 */
	public CaseContactController(CaseContactService service) {
		this.service = service;
	}

	/**
	 * {@code GET /api/v1/staff/verification-cases/{caseId}/contacts} - trả danh sách Trustee đã bổ nhiệm và Beneficiary của Vault
	 * (role STAFF_EXECUTOR, hồ sơ phải do Staff này phụ trách). Response {@code no-store}.
	 *
	 * @param caseId public id của hồ sơ xác minh
	 * @return 200 với {@link CaseContactDtos.Response}
	 */
	@GetMapping
	public ResponseEntity<CaseContactDtos.Response> list(@PathVariable UUID caseId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(caseId));
	}
}

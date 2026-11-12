package com.legacyvault.beneficiary;

import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.common.web.PageResponse;

/**
 * PS-118: read-only Staff metadata catalog for an assigned pre-unlock case.
 *
 * <p>Đường dẫn gốc {@code /api/v1/staff/verification-cases/{caseId}/assets}; yêu cầu {@code ROLE_STAFF_EXECUTOR}. Ủy quyền cho
 * {@code StaffAssetCatalogService}. Frontend dùng qua {@code pages/staff/staffLegalDocumentsService.js}.
 */
@RestController
@Validated
@RequestMapping("/api/v1/staff/verification-cases/{caseId}/assets")
@PreAuthorize("hasAuthority('ROLE_STAFF_EXECUTOR')")
public class StaffAssetCatalogController {
	private final StaffAssetCatalogService service;

	/**
	 * Hàm khởi tạo, nhận {@code StaffAssetCatalogService}.
	 */
	public StaffAssetCatalogController(StaffAssetCatalogService service) { this.service = service; }

	/**
	 * {@code GET /api/v1/staff/verification-cases/{caseId}/assets?page=&size=}: danh mục tài sản (chỉ metadata) của Vault thuộc case.
	 * @param page số trang từ 0 (mặc định 0)
	 * @param size kích thước trang 1-100 (mặc định 20)
	 * @return {@code PageResponse} của {@code StaffAssetCatalogDtos.Item}, {@code no-store}
	 */
	@GetMapping
	public ResponseEntity<PageResponse<StaffAssetCatalogDtos.Item>> list(@PathVariable UUID caseId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(caseId, page, size));
	}
}

package com.legacyvault.will.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.will.dto.OpenWillFileRequest;
import com.legacyvault.will.dto.WillResponse;
import com.legacyvault.will.dto.WillVersionResponse;
import com.legacyvault.will.service.WillFileDownload;
import com.legacyvault.will.service.WillService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * Controller REST di chúc số hóa (wills.md). Base path {@code /api/v1/vaults/{vaultId}/wills}.
 *
 * Các API đọc chỉ trả metadata; nội dung file chỉ mở được qua {@code .../download} sau khi Owner nhập lại mật khẩu (D-API-33).
 * Thiếu role {@code VAULT_OWNER} -> 403; Vault/di chúc không phải của mình -> 404. Mọi nghiệp vụ nằm ở {@link WillService}.
 * Di chúc là Asset loại DOCUMENT kèm {@code legal_documents.document_type = 'WILL'}.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/wills")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class WillController {

	/**
	 * Service nghiệp vụ di chúc.
	 */
	private final WillService willService;

	/**
	 * Khởi tạo controller với {@link WillService}.
	 *
	 * @param willService service nghiệp vụ di chúc
	 */
	public WillController(WillService willService) {
		this.willService = willService;
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/wills} (multipart/form-data) - tạo hồ sơ di chúc mới với phiên bản 1 (PS-17, role VAULT_OWNER).
	 * Part {@code file} (PDF/JPEG/PNG) và tham số {@code note} tùy chọn (tối đa 500 ký tự). Phần {@code file} không bắt buộc ở tầng
	 * binding để thiếu file trả 400 VALIDATION_FAILED như contract.
	 *
	 * @param vaultId public id của Vault
	 * @param file file di chúc
	 * @param note ghi chú tùy chọn
	 * @return 201 Created với {@link WillResponse}, header {@code Location} trỏ tới di chúc
	 */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<WillResponse> uploadWill(@PathVariable UUID vaultId,
			@RequestPart(name = "file", required = false) MultipartFile file,
			@RequestParam(name = "note", required = false) @Size(max = 500) String note,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		WillResponse created = willService.uploadWill(vaultId, CustomUserPrincipal.requireUserId(principal), file, note);
		return ResponseEntity.created(willLocation(vaultId, created.id())).body(created);
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/wills/{willId}/versions} (multipart/form-data, part {@code file}) - thêm phiên bản mới
	 * cho di chúc đã có (PS-18, role VAULT_OWNER); phiên bản cũ giữ nguyên.
	 *
	 * @return 201 Created với {@link WillResponse} chứa phiên bản mới nhất
	 */
	@PostMapping(path = "/{willId}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<WillResponse> addVersion(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@RequestPart(name = "file", required = false) MultipartFile file,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		WillResponse updated = willService.addVersion(vaultId, willId, CustomUserPrincipal.requireUserId(principal), file);
		return ResponseEntity.created(willLocation(vaultId, willId)).body(updated);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/wills?page=&size=} - liệt kê di chúc của Vault, mới nhất trước (role VAULT_OWNER).
	 *
	 * @param page số trang từ 0 (mặc định 0)
	 * @param size kích thước trang 1..100 (mặc định 20)
	 * @return {@link PageResponse} các {@link WillResponse}
	 */
	@GetMapping
	public PageResponse<WillResponse> listWills(@PathVariable UUID vaultId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.listWills(vaultId, CustomUserPrincipal.requireUserId(principal), page, size);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/wills/{willId}} - xem một di chúc kèm phiên bản hiện tại (role VAULT_OWNER).
	 *
	 * @return {@link WillResponse}; 404 nếu không thuộc Owner
	 */
	@GetMapping("/{willId}")
	public WillResponse getWill(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.getWill(vaultId, willId, CustomUserPrincipal.requireUserId(principal));
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/wills/{willId}/versions} - liệt kê mọi phiên bản (mới nhất trước) để đối chiếu toàn vẹn (role VAULT_OWNER).
	 *
	 * @return danh sách {@link WillVersionResponse}
	 */
	@GetMapping("/{willId}/versions")
	public List<WillVersionResponse> listVersions(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return willService.listVersions(vaultId, willId, CustomUserPrincipal.requireUserId(principal));
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/wills/{willId}/versions/{version}/download} - mở/tải nội dung một phiên bản sau khi nhập lại
	 * mật khẩu (D-API-33, role VAULT_OWNER). POST vì mật khẩu nằm trong body ({@link OpenWillFileRequest}). Luôn
	 * {@code attachment} + {@code nosniff} + {@code no-store}: file là nội dung người dùng tải lên, không để trình duyệt
	 * tự render hay lưu cache.
	 *
	 * @param version số phiên bản (>= 1)
	 * @return 200 với byte file giải mã
	 */
	@PostMapping("/{willId}/versions/{version}/download")
	public ResponseEntity<byte[]> openVersion(@PathVariable UUID vaultId, @PathVariable UUID willId,
			@PathVariable @Min(1) int version, @Valid @RequestBody OpenWillFileRequest request,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		WillFileDownload file = willService.openVersion(vaultId, willId, version,
				CustomUserPrincipal.requireUserId(principal), request.password());
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(file.contentType()))
				.contentLength(file.content().length)
				.cacheControl(CacheControl.noStore())
				.header("X-Content-Type-Options", "nosniff")
				.header(HttpHeaders.CONTENT_DISPOSITION,
						ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
				.body(file.content());
	}

	/**
	 * Tạo URI {@code Location} của một di chúc cho response 201.
	 */
	private static URI willLocation(UUID vaultId, UUID willId) {
		return URI.create("/api/v1/vaults/" + vaultId + "/wills/" + willId);
	}
}

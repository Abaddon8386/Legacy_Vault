package com.legacyvault.asset.controller;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.asset.dto.RevealAssetRequest;
import com.legacyvault.asset.service.AssetDocumentService;
import com.legacyvault.asset.service.AssetDocumentService.DocumentFile;
import com.legacyvault.asset.service.AssetDocumentService.DocumentInfo;
import com.legacyvault.common.security.CustomUserPrincipal;

import jakarta.validation.Valid;

/**
 * Controller REST quản lý tài liệu PDF / Word đính kèm vào Asset (PS-114, D-API-43).
 *
 * Base path: {@code /api/v1/vaults/{vaultId}/assets/{assetId}/documents}. Chỉ Owner của Vault (role
 * {@code VAULT_OWNER}; role khác 403, Vault/Asset của Owner khác 404). Liệt kê chỉ trả metadata; đọc file cần mật khẩu
 * đăng nhập hiện tại như các nội dung bảo mật khác. Mọi nghiệp vụ nằm trong {@link AssetDocumentService}.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets/{assetId}/documents")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetDocumentController {

	/**
	 * Service nghiệp vụ tài liệu đính kèm Asset.
	 */
	private final AssetDocumentService service;

	/**
	 * Khởi tạo controller với {@link AssetDocumentService}.
	 *
	 * @param service service nghiệp vụ tài liệu Asset
	 */
	public AssetDocumentController(AssetDocumentService service) {
		this.service = service;
	}

	/**
	 * Lấy id người dùng (Owner) từ principal; ném lỗi xác thực nếu principal null.
	 *
	 * @param principal principal đang đăng nhập
	 * @return id Owner
	 */
	private static Long owner(CustomUserPrincipal principal) {
		return CustomUserPrincipal.requireUserId(principal);
	}

	/**
	 * {@code GET /api/v1/vaults/{vaultId}/assets/{assetId}/documents} - liệt kê metadata các tài liệu của Asset
	 * (role VAULT_OWNER). Response {@code no-store}, không chứa nội dung file.
	 *
	 * @return danh sách {@link DocumentInfo}
	 */
	@GetMapping
	public ResponseEntity<List<DocumentInfo>> list(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(vaultId, assetId, owner(principal)));
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/documents} (multipart/form-data, part {@code documents}) -
	 * tải lên một hoặc nhiều tài liệu PDF/DOC/DOCX cho Asset (role VAULT_OWNER). Tất cả file của một request được lưu
	 * hoặc không file nào (xem {@link AssetDocumentService#add}).
	 *
	 * @param documents các file tải lên (có thể null -> 400 VALIDATION_FAILED)
	 * @return 201 với danh sách {@link DocumentInfo} hiện có của Asset
	 */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public List<DocumentInfo> add(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@RequestPart(name = "documents", required = false) List<MultipartFile> documents,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.add(vaultId, assetId, owner(principal), documents);
	}

	/**
	 * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/documents/{documentId}/download} - tải nội dung tài liệu
	 * sau khi nhập lại mật khẩu (role VAULT_OWNER). Dùng POST vì mật khẩu nằm trong body. Response là file đính kèm với
	 * {@code no-store}, {@code nosniff} và CSP {@code default-src 'none'; sandbox} để trình duyệt không thực thi nội dung.
	 *
	 * Body: {@link RevealAssetRequest}. Gọi {@link AssetDocumentService#open}.
	 *
	 * @return 200 với byte của file giải mã (Content-Disposition: attachment)
	 */
	@PostMapping("/{documentId}/download")
	public ResponseEntity<byte[]> open(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID documentId,
			@Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		DocumentFile file = service.open(vaultId, assetId, documentId, owner(principal), request.password());
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(file.contentType()))
				.contentLength(file.content().length)
				.cacheControl(CacheControl.noStore())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.header(HttpHeaders.CONTENT_DISPOSITION,
						ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
				.body(file.content());
	}

	/**
	 * {@code DELETE /api/v1/vaults/{vaultId}/assets/{assetId}/documents/{documentId}} - xóa tài liệu khỏi Asset
	 * (role VAULT_OWNER). Trả 204 No Content.
	 *
	 * @see AssetDocumentService#delete
	 */
	@DeleteMapping("/{documentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID documentId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		service.delete(vaultId, assetId, documentId, owner(principal));
	}
}

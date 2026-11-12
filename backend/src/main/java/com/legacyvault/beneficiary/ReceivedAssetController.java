package com.legacyvault.beneficiary;

import java.util.List;
import java.util.UUID;

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
import org.springframework.web.bind.annotation.RestController;

import com.legacyvault.asset.dto.RevealAssetRequest;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * PS-104: assets Staff handed over to the authenticated Beneficiary account. The account comes only from the principal;
 * there is no recipient, Vault or account id in any path or body. Responses are never cached.
 *
 * <p>Đường dẫn gốc {@code /api/v1/received-assets}; yêu cầu vai trò {@code ROLE_BENEFICIARY}. Ủy quyền cho {@code ReceivedAssetService}.
 * Frontend dùng ở trang {@code pages/beneficiary/ReceivedAssets.jsx}.
 */
@RestController
@RequestMapping("/api/v1/received-assets")
@PreAuthorize("hasRole('BENEFICIARY')")
public class ReceivedAssetController {

	private final ReceivedAssetService service;

	/**
	 * Hàm khởi tạo, nhận {@code ReceivedAssetService}.
	 */
	public ReceivedAssetController(ReceivedAssetService service) {
		this.service = service;
	}

	/**
	 * Lấy id tài khoản từ principal (ném lỗi nếu chưa xác thực).
	 */
	private static Long account(CustomUserPrincipal principal) {
		return CustomUserPrincipal.requireUserId(principal);
	}

	/**
	 * {@code GET /api/v1/received-assets?page=&size=}: liệt kê tài sản đã được bàn giao (size 1-100, mặc định 20).
	 * @return {@code PageResponse} của {@code ReceivedAssetDtos.Item}
	 */
	@GetMapping
	public ResponseEntity<PageResponse<ReceivedAssetDtos.Item>> list(
			@RequestParam(defaultValue = "0") @Min(0) int page, @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.list(account(principal), page, size));
	}

	/**
	 * {@code GET /api/v1/received-assets/{itemId}}: xem một tài sản đã nhận (không có nội dung bí mật).
	 * @param itemId mã công khai của mục bàn giao
	 */
	@GetMapping("/{itemId}")
	public ResponseEntity<ReceivedAssetDtos.Item> get(@PathVariable UUID itemId, @AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.get(account(principal), itemId));
	}

	/**
	 * {@code GET /api/v1/received-assets/{itemId}/images}: liệt kê metadata ảnh của tài sản.
	 */
	@GetMapping("/{itemId}/images")
	public ResponseEntity<List<ReceivedAssetDtos.Image>> images(@PathVariable UUID itemId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.listImages(account(principal), itemId));
	}

	/**
	 * {@code POST /api/v1/received-assets/{itemId}/content}: mở nội dung tài sản đã giải mã. Dùng POST vì mật khẩu đăng nhập nằm trong body
	 * ({@code RevealAssetRequest}); phản hồi {@code no-store}.
	 * @return {@code ReceivedAssetDtos.Content}
	 */
	@PostMapping("/{itemId}/content")
	public ResponseEntity<ReceivedAssetDtos.Content> content(@PathVariable UUID itemId, @Valid @RequestBody RevealAssetRequest request,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return noStore(service.openContent(account(principal), itemId, request.password()));
	}

	/**
	 * {@code POST /api/v1/received-assets/{itemId}/images/{imageId}/download}: tải ảnh giải mã. Body {@code RevealAssetRequest} chứa mật khẩu đăng nhập.
	 * @return nội dung ảnh dạng đính kèm với các header chống cache, {@code nosniff} và CSP sandbox
	 */
	@PostMapping("/{itemId}/images/{imageId}/download")
	public ResponseEntity<byte[]> image(@PathVariable UUID itemId, @PathVariable UUID imageId,
			@Valid @RequestBody RevealAssetRequest request, @AuthenticationPrincipal CustomUserPrincipal principal) {
		ReceivedAssetDtos.ImageFile file = service.openImage(account(principal), itemId, imageId, request.password());
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(file.contentType()))
				.contentLength(file.content().length)
				.cacheControl(CacheControl.noStore())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("received-asset-image").build().toString())
				.body(file.content());
	}

	/**
	 * Bọc body vào HTTP 200 với {@code Cache-Control: no-store}.
	 */
	private static <T> ResponseEntity<T> noStore(T body) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}
}

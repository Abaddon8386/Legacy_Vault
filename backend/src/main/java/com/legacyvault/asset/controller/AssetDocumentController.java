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
 * PS-114: PDF / Word documents attached to an Asset. Owner of the Vault only (other roles 403, other Owners' Vaults and
 * Assets 404). Listing returns metadata; reading a file needs the current login password like other protected content.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/assets/{assetId}/documents")
@PreAuthorize("hasRole('VAULT_OWNER')")
public class AssetDocumentController {

	private final AssetDocumentService service;

	public AssetDocumentController(AssetDocumentService service) {
		this.service = service;
	}

	private static Long owner(CustomUserPrincipal principal) {
		return CustomUserPrincipal.requireUserId(principal);
	}

	@GetMapping
	public ResponseEntity<List<DocumentInfo>> list(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(vaultId, assetId, owner(principal)));
	}

	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public List<DocumentInfo> add(@PathVariable UUID vaultId, @PathVariable UUID assetId,
			@RequestPart(name = "documents", required = false) List<MultipartFile> documents,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		return service.add(vaultId, assetId, owner(principal), documents);
	}

	/** POST because the password travels in the body; the response is a file, never cached or sniffed. */
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

	@DeleteMapping("/{documentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@PathVariable UUID vaultId, @PathVariable UUID assetId, @PathVariable UUID documentId,
			@AuthenticationPrincipal CustomUserPrincipal principal) {
		service.delete(vaultId, assetId, documentId, owner(principal));
	}
}

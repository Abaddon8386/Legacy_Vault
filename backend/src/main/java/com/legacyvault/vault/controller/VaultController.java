package com.legacyvault.vault.controller;

import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.service.VaultService;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.UUID;

/**
 * REST controller quản lý két (Vault) của chủ sở hữu, gốc đường dẫn {@code /api/v1/vaults}. Mọi endpoint yêu cầu
 * quyền {@code VAULT_OWNER}; người dùng hiện tại lấy từ {@link CustomUserPrincipal}. Logic nằm trong
 * {@link VaultService}.
 *
 * <ul>
 *   <li>{@code POST /api/v1/vaults} - tạo két;</li>
 *   <li>{@code GET /api/v1/vaults/{vaultId}} - xem một két;</li>
 *   <li>{@code GET /api/v1/vaults} - danh sách két phân trang;</li>
 *   <li>{@code POST /api/v1/vaults/{vaultId}/cancel-alert} - hủy cảnh báo chờ xác minh.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/vaults")
public class VaultController {

    /** Service nghiệp vụ két. */
    private final VaultService vaultService;

    /** Nhận {@link VaultService}. */
    public VaultController(VaultService vaultService) {
        this.vaultService = vaultService;
    }

    /**
     * {@code POST /api/v1/vaults} - tạo két đầu tiên của chủ sở hữu (mỗi chủ chỉ có một két).
     *
     * @param request   {@link CreateVaultRequest} gồm tên và mô tả
     * @param principal người dùng đang đăng nhập
     * @return {@code 201 Created} kèm header {@code Location: /api/v1/vaults/{id}} và {@link VaultResponse}
     * @throws com.legacyvault.common.error.BusinessException {@code VAULT_ALREADY_EXISTS} (409) nếu đã có két,
     *         {@code UNAUTHENTICATED} (401) nếu tài khoản không hoạt động
     */
    @PostMapping
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public ResponseEntity<VaultResponse> createVault(
            @Valid @RequestBody CreateVaultRequest request,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        VaultResponse response = vaultService.createVault(request, principal);

        URI location = ServletUriComponentsBuilder
                .fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(response.id())
                .toUri();

        return ResponseEntity.created(location).body(response);
    }

    /**
     * {@code GET /api/v1/vaults/{vaultId}} - xem két của chính mình.
     * PS-14: chỉ chủ Vault xem được; Vault của người khác -> 404 (D-API-07).
     *
     * @param vaultId   UUID công khai của két
     * @param principal người dùng đang đăng nhập
     * @return {@link VaultResponse}
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} (404)
     */
    @GetMapping("/{vaultId}")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public VaultResponse getVault(
            @PathVariable UUID vaultId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return vaultService.getVault(vaultId, principal);
    }

    /**
     * {@code GET /api/v1/vaults?page=&size=} - danh sách két của người đăng nhập, mới nhất trước.
     * D-API-23: Vault của người đăng nhập, phân trang (D-API-06).
     *
     * @param page      số trang, từ 0 (mặc định 0)
     * @param size      kích thước trang 1..100 (mặc định 20)
     * @param principal người dùng đang đăng nhập
     * @return {@link PageResponse} của {@link VaultResponse}
     */
    @GetMapping
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public PageResponse<VaultResponse> listVaults(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return vaultService.listVaults(principal, page, size);
    }


    /**
     * {@code POST /api/v1/vaults/{vaultId}/cancel-alert} - chủ két hủy cảnh báo khi két đang
     * {@code AWAITING_VERIFICATION} (hết gia hạn DMS), đưa két và DMS về trạng thái hoạt động.
     *
     * @param vaultId   UUID công khai của két
     * @param principal người dùng đang đăng nhập
     * @return {@link VaultResponse} sau khi khôi phục
     * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND}, {@code ALERT_NOT_CANCELLABLE}
     */
    @PostMapping("/{vaultId}/cancel-alert")
    @PreAuthorize("hasRole('VAULT_OWNER')")
    public VaultResponse cancelAlert(
            @PathVariable UUID vaultId,
            @AuthenticationPrincipal CustomUserPrincipal principal
    ) {
        return vaultService.cancelAlert(vaultId, principal);
    }

}
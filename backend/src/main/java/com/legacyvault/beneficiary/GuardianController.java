package com.legacyvault.beneficiary;

import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.legacyvault.common.api.PageEnvelope;

/**
 * Controller người giám hộ của người thụ hưởng chưa thành niên. Đường dẫn gốc
 * {@code /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/guardian}; yêu cầu {@code ROLE_VAULT_OWNER}. Frontend dùng qua
 * {@code services/guardianService.js} và {@code GuardianPanel.jsx}.
 */
@RestController
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/guardian")
public class GuardianController {
    private final GuardianService service;
    /**
     * Hàm khởi tạo, nhận {@code GuardianService}.
     */
    public GuardianController(GuardianService service) { this.service=service; }
    /**
     * {@code GET .../guardian}: xem ngữ cảnh người giám hộ (tuổi, cảnh báo, người giám hộ hiện tại).
     * @return {@code GuardianDtos.Context}
     */
    @GetMapping
    public GuardianDtos.Context read(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId) {
        return service.read(vaultId,beneficiaryId);
    }
    /**
     * {@code PUT .../guardian}: lưu hoặc thay thế người giám hộ (kèm {@code expectedRevision}).
     * @return {@code GuardianDtos.Context} mới
     */
    @PutMapping
    public GuardianDtos.Context replace(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @Valid @RequestBody GuardianDtos.UpsertRequest request) {
        return service.replace(vaultId,beneficiaryId,request);
    }
    /**
     * {@code POST .../guardian/revoke}: thu hồi người giám hộ hiện tại (kèm {@code expectedRevision}).
     * @return {@code GuardianDtos.Context} mới
     */
    @PostMapping("/revoke")
    public GuardianDtos.Context revoke(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @Valid @RequestBody GuardianDtos.RevokeRequest request) {
        return service.revoke(vaultId,beneficiaryId,request);
    }
    /**
     * {@code GET .../guardian/history?page=&size=}: lịch sử người giám hộ, phân trang (size 1-100, mặc định 20).
     * @return {@code PageEnvelope} của {@code GuardianDtos.Guardian}
     */
    @GetMapping("/history")
    public PageEnvelope<GuardianDtos.Guardian> history(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size) {
        return service.history(vaultId,beneficiaryId,page,size);
    }
}

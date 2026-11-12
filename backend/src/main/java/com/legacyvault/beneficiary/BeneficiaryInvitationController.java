package com.legacyvault.beneficiary;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Controller quản lý mã mời liên kết tài khoản của người thụ hưởng, dành cho chủ kho. Đường dẫn gốc
 * {@code /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/invitation}; yêu cầu {@code ROLE_VAULT_OWNER}. Mọi phản hồi đặt
 * {@code Cache-Control: no-store}. Ủy quyền cho {@code BeneficiaryInvitationService}.
 */
@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/invitation")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class BeneficiaryInvitationController {
    private final BeneficiaryInvitationService service;
    /**
     * Hàm khởi tạo, nhận {@code BeneficiaryInvitationService}.
     */
    public BeneficiaryInvitationController(BeneficiaryInvitationService service) { this.service = service; }
    /**
     * {@code GET .../invitation}: xem metadata mã hiện hành (không trả mã thô).
     * @return HTTP 200 với {@code InvitationDtos.Metadata} (trạng thái {@code NOT_ISSUED} nếu chưa cấp)
     */
    @GetMapping
    public ResponseEntity<InvitationDtos.Metadata> get(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(vaultId, beneficiaryId));
    }
    /**
     * {@code POST .../invitation}: cấp mã mời đầu tiên.
     * @return HTTP 201 với {@code InvitationDtos.Issued}; mã thô chỉ xuất hiện duy nhất lần này
     */
    @PostMapping
    public ResponseEntity<InvitationDtos.Issued> issue(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.issue(vaultId, beneficiaryId));
    }
    /**
     * {@code POST .../invitation/reissue}: cấp lại mã (thu hồi mã cũ). Body {@code InvitationDtos.ReissueRequest} chứa {@code generation} đang hiện hành để chống thao tác cũ.
     * @return HTTP 201 với {@code InvitationDtos.Issued}
     */
    @PostMapping("/reissue")
    public ResponseEntity<InvitationDtos.Issued> reissue(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
            @Valid @RequestBody InvitationDtos.ReissueRequest request) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service.reissue(vaultId, beneficiaryId, request.generation()));
    }
    /**
     * {@code DELETE .../invitation?generation=n}: thu hồi mã hiện hành.
     * @param generation thế hệ mã cần thu hồi (tối thiểu 1)
     * @return HTTP 204 không nội dung
     */
    @DeleteMapping
    public ResponseEntity<Void> revoke(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
            @RequestParam @Min(1) int generation) {
        service.revoke(vaultId, beneficiaryId, generation);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}

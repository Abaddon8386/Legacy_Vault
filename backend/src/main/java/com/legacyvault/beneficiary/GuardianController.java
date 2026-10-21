package com.legacyvault.beneficiary;

import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.legacyvault.common.api.PageEnvelope;

@RestController
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/guardian")
public class GuardianController {
    private final GuardianService service;
    public GuardianController(GuardianService service) { this.service=service; }
    @GetMapping
    public GuardianDtos.Context read(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId) {
        return service.read(vaultId,beneficiaryId);
    }
    @PutMapping
    public GuardianDtos.Context replace(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @Valid @RequestBody GuardianDtos.UpsertRequest request) {
        return service.replace(vaultId,beneficiaryId,request);
    }
    @PostMapping("/revoke")
    public GuardianDtos.Context revoke(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @Valid @RequestBody GuardianDtos.RevokeRequest request) {
        return service.revoke(vaultId,beneficiaryId,request);
    }
    @GetMapping("/history")
    public PageEnvelope<GuardianDtos.Guardian> history(@PathVariable UUID vaultId,@PathVariable UUID beneficiaryId,
            @RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size) {
        return service.history(vaultId,beneficiaryId,page,size);
    }
}

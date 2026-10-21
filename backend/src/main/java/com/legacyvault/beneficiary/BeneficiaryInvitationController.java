package com.legacyvault.beneficiary;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/invitation")
@PreAuthorize("hasAuthority('ROLE_VAULT_OWNER')")
public class BeneficiaryInvitationController {
    private final BeneficiaryInvitationService service;
    public BeneficiaryInvitationController(BeneficiaryInvitationService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<InvitationDtos.Metadata> get(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(vaultId, beneficiaryId));
    }
    @PostMapping
    public ResponseEntity<InvitationDtos.Issued> issue(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.issue(vaultId, beneficiaryId));
    }
    @PostMapping("/reissue")
    public ResponseEntity<InvitationDtos.Issued> reissue(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
            @Valid @RequestBody InvitationDtos.ReissueRequest request) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service.reissue(vaultId, beneficiaryId, request.generation()));
    }
    @DeleteMapping
    public ResponseEntity<Void> revoke(@PathVariable UUID vaultId, @PathVariable UUID beneficiaryId,
            @RequestParam @Min(1) int generation) {
        service.revoke(vaultId, beneficiaryId, generation);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}

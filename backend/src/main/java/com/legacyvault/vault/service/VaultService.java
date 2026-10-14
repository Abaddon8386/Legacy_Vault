package com.legacyvault.vault.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class VaultService {

    private final VaultRepository vaultRepository;
    private final AuditService auditService;

    public VaultService(VaultRepository vaultRepository, AuditService auditService) {
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
    }

    @Transactional
    public VaultResponse createVault(CreateVaultRequest request, CustomUserPrincipal principal) {
        Long ownerUserId = principal.userId();

        if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
            throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
        }

        Vault vault = new Vault();
        vault.setOwnerUserId(ownerUserId);
        vault.setName(request.name().trim());
        vault.setDescription(request.description());

        final Vault savedVault;

        try {
            savedVault = vaultRepository.saveAndFlush(vault);
        } catch (DataIntegrityViolationException exception) {
            // Chỉ xử lý lỗi khi lưu Vault, không bắt lỗi từ AuditService.
            if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
                throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
            }
            throw exception;
        }

        // Ghi audit trong transaction tạo Vault hiện tại.
        auditService.record(new AuditEvent(
                AuditAction.VAULT_CREATED,
                AuditActorType.USER,
                ownerUserId,
                savedVault.getVaultId(),
                "VAULT",
                savedVault.getVaultId(),
                null,
                null,
                null,
                Map.of("result", "SUCCESS", "vaultPublicId", savedVault.getPublicId().toString()),
                "VAULT_CREATE",
                null
        ));

        return toResponse(savedVault);
    }


    private VaultResponse toResponse(Vault vault) {
        return new VaultResponse(
                vault.getPublicId(),
                vault.getName(),
                vault.getDescription(),
                vault.getStatus(),
                vault.getCreatedAt(),
                vault.getUpdatedAt()
        );
    }
}

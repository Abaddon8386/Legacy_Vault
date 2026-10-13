package com.legacyvault.vault;

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

@Service
public class VaultService {

    private final VaultRepository vaultRepository;

    public VaultService(VaultRepository vaultRepository) {
        this.vaultRepository = vaultRepository;
    }

    @Transactional
    public VaultResponse createVault(
            CreateVaultRequest request,
            CustomUserPrincipal principal
    ) {
        Long ownerUserId = principal.userId();

        if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
            throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
        }

        Vault vault = new Vault();
        vault.setOwnerUserId(ownerUserId);
        vault.setName(request.name().trim());
        vault.setDescription(request.description());

        try {
            Vault savedVault = vaultRepository.saveAndFlush(vault);
            return toResponse(savedVault);
        } catch (DataIntegrityViolationException exception) {
            // Không chuyển mọi lỗi database thành lỗi Vault đã tồn tại.
            if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
                throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
            }
            throw exception;
        }
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

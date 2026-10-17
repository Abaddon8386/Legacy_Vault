package com.legacyvault.vault.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.dms.DmsConfig;
import com.legacyvault.dms.DmsConfigRepository;
import com.legacyvault.vault.dto.CreateVaultRequest;
import com.legacyvault.vault.dto.VaultResponse;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.user.repository.OwnerWriteLockRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class VaultService {

    /** Trạng thái duy nhất Owner còn được sửa kho (Asset, Will, Trustee, Beneficiary...) — LV-OWN-001. */
    private static final String EDITABLE_STATUS = "ACTIVE";

    private final VaultRepository vaultRepository;
    private final AuditService auditService;
    private final DmsConfigRepository dmsConfigRepository;
    private final VerificationCaseRepository verificationCaseRepository;
    private final OwnerWriteLockRepository creationLockRepository;

    public VaultService(
            VaultRepository vaultRepository,
            AuditService auditService,
            DmsConfigRepository dmsConfigRepository,
            VerificationCaseRepository verificationCaseRepository,
            OwnerWriteLockRepository creationLockRepository
    ) {
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
        this.dmsConfigRepository = dmsConfigRepository;
        this.verificationCaseRepository = verificationCaseRepository;
        this.creationLockRepository = creationLockRepository;
    }

    @Transactional
    public VaultResponse createVault(CreateVaultRequest request, CustomUserPrincipal principal) {
        Long ownerUserId = CustomUserPrincipal.requireUserId(principal);

        // Serialize first creation on a row that already exists. A lock on a missing Vault is insufficient.
        creationLockRepository.findActiveOwnerForUpdate(ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));

        if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
            throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
        }

        Vault vault = new Vault();
        vault.setOwnerUserId(ownerUserId);
        vault.setName(request.name().trim());
        vault.setDescription(request.description());

        // The DB unique key remains the final constraint; do not query a failed Hibernate transaction.
        Vault savedVault = vaultRepository.saveAndFlush(vault);

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

    /** PS-14: xem Vault của chính mình. Không tồn tại hay của người khác đều 404 (D-API-07). */
    @Transactional(readOnly = true)
    public VaultResponse getVault(UUID vaultId, CustomUserPrincipal principal) {
        return toResponse(requireOwnedVault(vaultId, CustomUserPrincipal.requireUserId(principal)));
    }

    /** D-API-23: các Vault của người đăng nhập, mới nhất trước. */
    @Transactional(readOnly = true)
    public PageResponse<VaultResponse> listVaults(CustomUserPrincipal principal, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return PageResponse.from(
                vaultRepository.findByOwnerUserId(CustomUserPrincipal.requireUserId(principal), pageable),
                this::toResponse);
    }

    /**
     * Điểm kiểm tra ownership dùng chung cho mọi tài nguyên dưới {@code /vaults/{vaultId}/**} (asset, will...).
     * Không tồn tại hay thuộc người khác đều cùng 404 để không lộ sự tồn tại (D-API-07).
     */
    @Transactional(readOnly = true)
    public Vault requireOwnedVault(UUID vaultId, Long ownerUserId) {
        return vaultRepository.findByPublicIdAndOwnerUserId(vaultId, ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    /**
     * Như {@link #requireOwnedVault} nhưng Owner còn phải có quyền sửa kho: chỉ khi Vault {@code ACTIVE}.
     * Mọi trạng thái từ {@code AWAITING_VERIFICATION} trở đi -> 409 VAULT_NOT_EDITABLE. Ownership kiểm trước,
     * nên người lạ luôn nhận 404 chứ không phải 409.
     *
     * <p>TODO(PS-22/PS-23): khi có DMS, chặn thêm lúc {@code dms.status = 'GRACE_PERIOD_EXCEEDED'} (ST-08 đóng băng
     * quyền sửa trước khi ST-09 đổi trạng thái Vault).
     */
    @Transactional(readOnly = true)
    public Vault requireEditableVault(UUID vaultId, Long ownerUserId) {
        Vault vault = requireOwnedVault(vaultId, ownerUserId);
        if (!EDITABLE_STATUS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
        }
        return vault;
    }

    @Transactional
    public VaultResponse cancelAlert(UUID vaultId, CustomUserPrincipal principal) {
        Long ownerUserId = CustomUserPrincipal.requireUserId(principal);

        // Khóa Vault và xác minh ownership trước khi kiểm tra trạng thái.
        Vault vault = vaultRepository.findOwnedVaultForUpdate(vaultId, ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!"AWAITING_VERIFICATION".equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.ALERT_NOT_CANCELLABLE);
        }

        // Khóa DMS để tránh scheduler thay đổi trạng thái cùng lúc.
        DmsConfig dms = dmsConfigRepository.findByOwnerUserIdForUpdate(ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ALERT_NOT_CANCELLABLE));

        // Grace Period đã hết; trạng thái cần khớp với vòng đời DMS thực tế.
        if (!"GRACE_PERIOD_EXCEEDED".equals(dms.getStatus())) {
            throw new BusinessException(ErrorCode.ALERT_NOT_CANCELLABLE);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        // Khóa các vụ việc của Vault và chỉ hủy intake chưa hoàn tất.
        List<VerificationCase> cases =
                verificationCaseRepository.findByVaultIdForUpdate(vault.getVaultId());

        long cancelledCaseCount = cases.stream()
                .filter(VerificationCase::isOpen)
                .count();

        for (VerificationCase verificationCase : cases) {
            if (verificationCase.isOpen()) {
                verificationCase.cancel(now);
            }
        }

        // Phục hồi Vault và DMS trong cùng transaction.
        vault.restoreActive();
        dms.restoreAfterAlert(now);

        vaultRepository.saveAndFlush(vault);
        dmsConfigRepository.saveAndFlush(dms);
        verificationCaseRepository.flush();

        auditService.record(new AuditEvent(
                AuditAction.VAULT_ALERT_CANCELLED,
                AuditActorType.USER,
                ownerUserId,
                vault.getVaultId(),
                "VAULT",
                vault.getVaultId(),
                "AWAITING_VERIFICATION",
                "ACTIVE",
                null,
                Map.of(
                        "dmsStateBefore", "GRACE_PERIOD_EXCEEDED",
                        "dmsStateAfter", "MONITORING",
                        "cancelledOpenCaseCount", cancelledCaseCount,
                        "stepId", "ST-08",
                        "ruleId", "LV-OWN-001"
                ),
                "ST-08",
                "LV-OWN-001"
        ));

        return toResponse(vault);
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

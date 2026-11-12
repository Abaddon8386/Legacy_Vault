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
import org.springframework.transaction.annotation.Propagation;
import jakarta.persistence.EntityManager;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Nghiệp vụ quản lý két (Vault), được {@code VaultController} gọi cho các endpoint
 * {@code POST /api/v1/vaults}, {@code GET /api/v1/vaults}, {@code GET /api/v1/vaults/{vaultId}} và
 * {@code POST /api/v1/vaults/{vaultId}/cancel-alert}. Đồng thời là điểm kiểm tra quyền sở hữu/trạng thái két dùng
 * chung cho các service tài sản, di chúc, người thụ hưởng, DMS...
 *
 * <p>Làm việc với các bảng {@code vaults} ({@link VaultRepository}), {@code dms_configs}
 * ({@link DmsConfigRepository}) và {@code verification_cases}; ghi audit {@code VAULT_CREATED},
 * {@code VAULT_ALERT_CANCELLED} qua {@link AuditService}. Việc tạo két được tuần tự hóa bằng khóa hàng của chủ
 * ({@link OwnerWriteLockRepository}).
 */
@Service
public class VaultService {

    /** Trạng thái duy nhất Owner còn được sửa kho (Asset, Will, Trustee, Beneficiary...) — LV-OWN-001. */
    private static final String EDITABLE_STATUS = "ACTIVE";

    /** Truy cập bảng {@code vaults}. */
    private final VaultRepository vaultRepository;
    /** Ghi nhật ký kiểm toán. */
    private final AuditService auditService;
    /** Truy cập cấu hình DMS (khóa khi hủy cảnh báo). */
    private final DmsConfigRepository dmsConfigRepository;
    /** Truy cập các vụ xác minh (hủy vụ đang mở khi hủy cảnh báo). */
    private final VerificationCaseRepository verificationCaseRepository;
    /** Khóa hàng người dùng để tuần tự hóa việc tạo két đầu tiên. */
    private final OwnerWriteLockRepository creationLockRepository;
    /** Dùng {@code refresh} để đọc lại trạng thái két từ DB sau khi khóa. */
    private final EntityManager entities;

    /** Nhận các repository và service phụ thuộc. */
    public VaultService(
            VaultRepository vaultRepository,
            AuditService auditService,
            DmsConfigRepository dmsConfigRepository,
            VerificationCaseRepository verificationCaseRepository,
            OwnerWriteLockRepository creationLockRepository,
            EntityManager entities
    ) {
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
        this.dmsConfigRepository = dmsConfigRepository;
        this.verificationCaseRepository = verificationCaseRepository;
        this.creationLockRepository = creationLockRepository;
        this.entities = entities;
    }

    /**
     * Tạo két mới cho chủ sở hữu đang đăng nhập ({@code POST /api/v1/vaults}).
     *
     * <p>Các bước: lấy {@code userId} từ principal; khóa hàng người dùng đang hoạt động để chặn tạo đồng thời; từ chối
     * nếu đã có két; tạo {@link Vault} (tên được cắt khoảng trắng) và lưu; ghi audit {@code VAULT_CREATED}
     * (step VAULT_CREATE) trong cùng transaction.
     *
     * @param request   tên và mô tả két
     * @param principal người dùng đăng nhập
     * @return thông tin két vừa tạo
     * @throws BusinessException {@code UNAUTHENTICATED} (principal null hoặc user không hoạt động),
     *                           {@code VAULT_ALREADY_EXISTS}
     */
    @Transactional
    public VaultResponse createVault(CreateVaultRequest request, CustomUserPrincipal principal) {
        Long ownerUserId = CustomUserPrincipal.requireUserId(principal);

        // Tuần tự hóa việc tạo két đầu tiên trên một dòng đã tồn tại (dòng user); khóa một Vault chưa có thì không đủ.
        creationLockRepository.findActiveOwnerForUpdate(ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));

        if (vaultRepository.existsByOwnerUserId(ownerUserId)) {
            throw new BusinessException(ErrorCode.VAULT_ALREADY_EXISTS);
        }

        Vault vault = new Vault();
        vault.setOwnerUserId(ownerUserId);
        vault.setName(request.name().trim());
        vault.setDescription(request.description());

        // Khóa unique ở DB vẫn là ràng buộc cuối cùng; không truy vấn thêm trong transaction Hibernate đã lỗi.
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

    /**
     * PS-14: xem Vault của chính mình. Không tồn tại hay của người khác đều 404 (D-API-07).
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} hoặc {@code UNAUTHENTICATED}
     */
    @Transactional(readOnly = true)
    public VaultResponse getVault(UUID vaultId, CustomUserPrincipal principal) {
        return toResponse(requireOwnedVault(vaultId, CustomUserPrincipal.requireUserId(principal)));
    }

    /**
     * D-API-23: các Vault của người đăng nhập, mới nhất trước.
     *
     * @param principal người dùng đăng nhập
     * @param page      số trang (từ 0)
     * @param size      kích thước trang
     * @return trang kết quả sắp xếp giảm dần theo {@code createdAt}
     */
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
     *
     * @param vaultId     UUID công khai của két
     * @param ownerUserId id chủ sở hữu
     * @return két thuộc chủ đó
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
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
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} hoặc {@code VAULT_NOT_EDITABLE}
     */
    @Transactional(readOnly = true)
    public Vault requireEditableVault(UUID vaultId, Long ownerUserId) {
        Vault vault = requireOwnedVault(vaultId, ownerUserId);
        if (!EDITABLE_STATUS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
        }
        return vault;
    }

    /**
     * Các luồng ghi nội dung giữ khóa Owner -> Vault suốt các bước kiểm tra hạn mức, ghi nội dung và commit audit.
     * Trạng thái được đọc lại sau khi khóa để entity ACTIVE còn trong cache không vượt qua được việc két đã bị đóng
     * băng/tạm giữ.
     *
     * <p>Bắt buộc chạy trong transaction có sẵn ({@code MANDATORY}); khóa két, đọc lại từ DB rồi yêu cầu trạng thái
     * {@code ACTIVE}. Dùng bởi các service ghi nội dung (tài sản/ảnh/tài liệu, di chúc, người thụ hưởng, lời mời, cấu hình DMS...).
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} hoặc {@code VAULT_NOT_EDITABLE}
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Vault requireEditableVaultForUpdate(UUID vaultId, Long ownerUserId) {
        Vault vault = requireNotArchivedVaultForUpdate(vaultId, ownerUserId);
        if (!EDITABLE_STATUS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
        }
        return vault;
    }

    /**
     * Dùng cho check-in DMS: vẫn giữ chính sách MONITORING hiện có nhưng không được ghi thêm log sau khi két đã lưu trữ.
     * Khóa két của chủ (theo publicId + owner), đọc lại từ DB, và chỉ từ chối khi két đã {@code ARCHIVED}.
     *
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} hoặc {@code VAULT_NOT_EDITABLE}
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Vault requireNotArchivedVaultForUpdate(UUID vaultId, Long ownerUserId) {
        Vault vault = vaultRepository.findOwnedVaultForUpdate(vaultId, ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        entities.refresh(vault);
        if (!ownerUserId.equals(vault.getOwnerUserId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        if (Vault.STATUS_ARCHIVED.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.VAULT_NOT_EDITABLE);
        }
        return vault;
    }

    /**
     * Hủy cảnh báo ({@code POST /api/v1/vaults/{vaultId}/cancel-alert}, bước ST-08): chủ két xác nhận mình còn sống
     * sau khi DMS hết thời gian gia hạn.
     *
     * <p>Các bước: khóa két theo (publicId, chủ) và yêu cầu trạng thái {@code AWAITING_VERIFICATION}; khóa dòng DMS và
     * yêu cầu {@code GRACE_PERIOD_EXCEEDED}; khóa các vụ xác minh của két rồi hủy các vụ còn mở; đưa két về
     * {@code ACTIVE} và DMS về {@code MONITORING} ({@code restoreAfterAlert}); lưu tất cả và ghi audit
     * {@code VAULT_ALERT_CANCELLED} (step ST-08, rule LV-OWN-001) kèm số vụ đã hủy. Thứ tự khóa Vault trước DMS khớp với
     * {@code DmsTriggerProcessor}.
     *
     * @param vaultId   UUID công khai của két
     * @param principal người dùng đăng nhập
     * @return thông tin két sau khi khôi phục
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}, {@code ALERT_NOT_CANCELLABLE}
     */
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


    /** Đổi entity {@link Vault} sang {@link VaultResponse} (dùng UUID công khai làm {@code id}). */
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

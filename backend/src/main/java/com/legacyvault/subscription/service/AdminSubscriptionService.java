package com.legacyvault.subscription.service;

import com.legacyvault.common.api.PageEnvelope;
import com.legacyvault.subscription.dto.AdminPaymentDtos.Transaction;
import com.legacyvault.subscription.dto.AdminPaymentDtos.Filter;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.dao.DataAccessException;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.AdminSubscriptionDtos.*;
import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion.VersionStatus;
import com.legacyvault.subscription.repository.OwnerUsageRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanVersionRepository;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.repository.VaultRepository;
import jakarta.persistence.OptimisticLockException;
import org.springframework.data.domain.PageRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Nghiệp vụ quản trị gói đăng ký, được {@code AdminSubscriptionController} ({@code /api/v1/admin/subscriptions}, role ADMIN) gọi.
 *
 * <p>Vòng đời version: DRAFT (sửa được) -> PUBLISHED (đang bán, mỗi gói tối đa một) -> DEPRECATED. Mọi thao tác thay đổi đều khóa gói
 * ({@code SubscriptionPlanRepository.lockPlan}) để tuần tự hóa với việc chụp giá khi Owner tạo đơn thanh toán, và ghi audit
 * ({@code SUBSCRIPTION_PLAN_DRAFT_CREATED}, {@code SUBSCRIPTION_PLAN_DRAFT_UPDATED}, {@code SUBSCRIPTION_PLAN_PUBLISHED}, {@code SUBSCRIPTION_PLAN_DEPRECATED}).
 * Bảng: {@code subscription_plan_versions}, {@code subscription_plans}, {@code subscription_payments}, {@code users}, {@code vaults}.
 */
@Service
public class AdminSubscriptionService {

    /**
     * Dung lượng tối đa mỗi file của mọi gói: đúng 10 MB.
     */
    public static final long STANDARD_MAX_FILE_BYTES = 10485760L; // 10 MB exactly
    /**
     * Các mã gói hợp lệ.
     */
    private static final Set<String> ALLOWED_PLANS = Set.of("BASIC", "STANDARD", "EXTENDED");

    /**
     * Repository các version gói.
     */
    private final SubscriptionPlanVersionRepository planVersionRepository;
    /**
     * Repository catalog gói đang bán (đồng bộ khi publish / deprecate, khóa gói).
     */
    private final SubscriptionPlanRepository activePlanRepository;
    /**
     * Tra cứu tài khoản.
     */
    private final UserRepository userRepository;
    /**
     * Đọc mức sử dụng của Owner.
     */
    private final OwnerUsageRepository ownerUsageRepository;
    /**
     * Tra cứu Vault của Owner.
     */
    private final VaultRepository vaultRepository;
    /**
     * Ghi audit.
     */
    private final AuditService auditService;
    /**
     * Đọc đơn thanh toán và gói hiệu lực.
     */
    private final com.legacyvault.subscription.repository.PaymentRepository payments;

    /**
     * Khởi tạo service với các repository do Spring inject.
     */
    public AdminSubscriptionService(
        SubscriptionPlanVersionRepository planVersionRepository,
        SubscriptionPlanRepository activePlanRepository,
        UserRepository userRepository,
        OwnerUsageRepository ownerUsageRepository,
        VaultRepository vaultRepository,
        AuditService auditService,
        com.legacyvault.subscription.repository.PaymentRepository payments
    ) {
        this.planVersionRepository = planVersionRepository;
        this.activePlanRepository = activePlanRepository;
        this.userRepository = userRepository;
        this.ownerUsageRepository = ownerUsageRepository;
        this.vaultRepository = vaultRepository;
        this.auditService = auditService;
        this.payments = payments;
    }

    /**
     * Tóm tắt 3 gói BASIC, STANDARD, EXTENDED ({@code GET /plans}): version PUBLISHED, bản nháp, tổng số version, giá và giới hạn (mặc định 5 Asset / 100 MB nếu gói chưa có version).
     *
     * @return danh sách {@link PlanSummaryDto}
     */
    @Transactional(readOnly = true)
    public List<PlanSummaryDto> listPlans() {
        List<String> planCodes = List.of("BASIC", "STANDARD", "EXTENDED");
        List<PlanSummaryDto> summaries = new ArrayList<>();

        for (String code : planCodes) {
            List<SubscriptionPlanVersion> versions = planVersionRepository.findByPlanCodeOrderByVersionDesc(code);
            SubscriptionPlanVersion activeVersion = versions.stream()
                .filter(v -> v.getStatus() == VersionStatus.PUBLISHED)
                .findFirst()
                .orElse(null);

            SubscriptionPlanVersion draftVersion = versions.stream()
                .filter(v -> v.getStatus() == VersionStatus.DRAFT)
                .findFirst()
                .orElse(null);

            SubscriptionPlanVersion representative = activeVersion != null ? activeVersion : (versions.isEmpty() ? null : versions.get(0));

            String nameVi = representative != null ? representative.getNameVi() : code;
            String nameEn = representative != null ? representative.getNameEn() : code;
            int activeVer = activeVersion != null ? activeVersion.getVersion() : 0;
            long activePrice = activeVersion != null ? activeVersion.getPurchasePriceVnd() : 0L;
            String activeBilling = activeVersion != null ? activeVersion.getBillingModel() : "LIFETIME";
            String activeStatus = activeVersion != null ? "PUBLISHED" : (versions.isEmpty() ? "NONE" : "NO_ACTIVE_VERSION");

            PlanLimitsDto limits = representative != null
                ? new PlanLimitsDto(representative.getAssetLimit(), representative.getStorageLimitBytes(), representative.getFileLimitBytes())
                : new PlanLimitsDto(5, 104857600L, STANDARD_MAX_FILE_BYTES);

            summaries.add(new PlanSummaryDto(
                code,
                nameVi,
                nameEn,
                activeVer,
                activePrice,
                activeBilling,
                activeStatus,
                draftVersion != null,
                draftVersion != null ? draftVersion.getVersion() : null,
                versions.size(),
                limits
            ));
        }

        return summaries;
    }

    /**
     * Chi tiết một gói kèm mọi version ({@code GET /plans/{planCode}}).
     *
     * @throws com.legacyvault.common.exception.BusinessException PLAN_VERSION_NOT_FOUND nếu mã gói không hợp lệ
     */
    @Transactional(readOnly = true)
    public PlanDetailDto getPlanDetail(String planCode) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);

        List<SubscriptionPlanVersion> versions = planVersionRepository.findByPlanCodeOrderByVersionDesc(normalizedCode);
        SubscriptionPlanVersion active = versions.stream()
            .filter(v -> v.getStatus() == VersionStatus.PUBLISHED)
            .findFirst()
            .orElse(null);

        String nameVi = active != null ? active.getNameVi() : normalizedCode;
        String nameEn = active != null ? active.getNameEn() : normalizedCode;
        int activeVer = active != null ? active.getVersion() : 0;

        List<SubscriptionPlanVersionDto> dtos = versions.stream()
            .map(this::toVersionDto)
            .toList();

        return new PlanDetailDto(normalizedCode, nameVi, nameEn, activeVer, dtos);
    }

    /**
     * Danh sách version của gói, mới nhất trước ({@code GET /plans/{planCode}/versions}).
     */
    @Transactional(readOnly = true)
    public List<SubscriptionPlanVersionDto> listPlanVersions(String planCode) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        return planVersionRepository.findByPlanCodeOrderByVersionDesc(normalizedCode)
            .stream()
            .map(this::toVersionDto)
            .toList();
    }

    /**
     * Một version cụ thể ({@code GET /plans/{planCode}/versions/{version}}).
     *
     * @throws com.legacyvault.common.exception.BusinessException PLAN_VERSION_NOT_FOUND
     */
    @Transactional(readOnly = true)
    public SubscriptionPlanVersionDto getPlanVersion(String planCode, int version) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        SubscriptionPlanVersion v = planVersionRepository.findByPlanCodeAndVersion(normalizedCode, version)
            .orElseThrow(() -> new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND));
        return toVersionDto(v);
    }

    /**
     * Tạo bản nháp từ một version nguồn ({@code POST /plans/{planCode}/versions}): khóa gói; mỗi gói chỉ một DRAFT; nguồn phải thuộc đúng gói; số version = max + 1;
     * sao chép nội dung / giá / giới hạn (file luôn 10 MB; giá legacy MONTHLY được đặt lại về giá mặc định). Lưu rồi audit {@code SUBSCRIPTION_PLAN_DRAFT_CREATED}.
     *
     * @param planCode mã gói
     * @param request version nguồn và ghi chú
     * @param adminUserId admin thực hiện
     * @param ipAddress IP ghi audit
     * @return {@link SubscriptionPlanVersionDto} của bản nháp
     * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED, PLAN_VERSION_ALREADY_EXISTS, PLAN_VERSION_NOT_FOUND
     */
    @Transactional
    public SubscriptionPlanVersionDto createDraftVersion(String planCode, CreateDraftRequest request, Long adminUserId, String ipAddress) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        activePlanRepository.lockPlan(normalizedCode);

        if (request == null || request.sourceVersionId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        // Check if an un-published draft already exists
        if (planVersionRepository.existsByPlanCodeAndStatus(normalizedCode, VersionStatus.DRAFT)) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_ALREADY_EXISTS);
        }

        SubscriptionPlanVersion source = planVersionRepository.findById(request.sourceVersionId())
            .orElseThrow(() -> new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND));

        if (!source.getPlanCode().equals(normalizedCode)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        int nextVersion = planVersionRepository.findMaxVersion(normalizedCode) + 1;

        SubscriptionPlanVersion draft = new SubscriptionPlanVersion();
        draft.setPlanCode(normalizedCode);
        draft.setVersion(nextVersion);
        draft.setStatus(VersionStatus.DRAFT);
        draft.setNameVi(source.getNameVi());
        draft.setNameEn(source.getNameEn());
        draft.setDescriptionVi(source.getDescriptionVi());
        draft.setDescriptionEn(source.getDescriptionEn());
        draft.setPurchasePriceVnd("LIFETIME".equals(source.getBillingModel()) ? source.getPurchasePriceVnd()
            : switch (normalizedCode) { case "STANDARD" -> 499000L; case "EXTENDED" -> 999000L; default -> 0L; });
        draft.setBillingModel("LIFETIME");
        draft.setAssetLimit(source.getAssetLimit());
        draft.setStorageLimitBytes(source.getStorageLimitBytes());
        draft.setFileLimitBytes(STANDARD_MAX_FILE_BYTES); // strictly 10 MB
        draft.setCreatedByUserId(adminUserId);
        draft.setChangeNote(request.changeNotes());
        draft.setConcurrencyToken(0L);

        try {
            SubscriptionPlanVersion saved = planVersionRepository.saveAndFlush(draft);

            Map<String, Object> meta = new HashMap<>();
            meta.put("planCode", normalizedCode);
            meta.put("version", nextVersion);
            meta.put("sourceVersionId", source.getId());
            meta.put("ipAddress", ipAddress);
            auditService.record(new AuditEvent(
                AuditAction.SUBSCRIPTION_PLAN_DRAFT_CREATED,
                AuditActorType.USER,
                adminUserId,
                null,
                "SUBSCRIPTION_PLAN_VERSION",
                saved.getId(),
                null,
                state(saved),
                ipAddress,
                meta,
                null,
                null
            ));

            return toVersionDto(saved);
        } catch (DataIntegrityViolationException ex) {
            // Caught DB filtered unique index conflict (another draft created in parallel)
            throw new BusinessException(ErrorCode.PLAN_VERSION_ALREADY_EXISTS);
        }
    }

    /**
     * Sửa bản nháp ({@code PUT /plans/{planCode}/versions/{version}}): khóa gói; chỉ DRAFT; {@code concurrencyToken} phải khớp (nếu không PLAN_VERSION_CONFLICT);
     * kiểm tra file = 10 MB, dung lượng >= 10 MB, giá >= 0 (BASIC phải 0), billing LIFETIME, số Asset >= 1. Lưu rồi audit {@code SUBSCRIPTION_PLAN_DRAFT_UPDATED} kèm trạng thái trước / sau.
     *
     * @throws com.legacyvault.common.exception.BusinessException PLAN_VERSION_NOT_FOUND, PLAN_VERSION_NOT_EDITABLE, PLAN_VERSION_CONFLICT, VALIDATION_FAILED
     */
    @Transactional
    public SubscriptionPlanVersionDto updateDraftVersion(String planCode, int version, UpdatePlanVersionRequest request, Long adminUserId, String ipAddress) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        activePlanRepository.lockPlan(normalizedCode);

        SubscriptionPlanVersion v = planVersionRepository.findByPlanCodeAndVersion(normalizedCode, version)
            .orElseThrow(() -> new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND));

        if (v.getStatus() != VersionStatus.DRAFT) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_NOT_EDITABLE);
        }

        // Concurrency Check (Strict token match)
        if (request.concurrencyToken() == null || !request.concurrencyToken().equals(v.getConcurrencyToken())) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_CONFLICT);
        }

        // Backend Validations
        if (request.fileBytesLimit() == null || request.fileBytesLimit() != STANDARD_MAX_FILE_BYTES) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        if (request.storageBytesLimit() == null || request.storageBytesLimit() < STANDARD_MAX_FILE_BYTES) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        if (request.purchasePriceVnd() == null || request.purchasePriceVnd() < 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        if ("BASIC".equals(normalizedCode) && request.purchasePriceVnd() != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        if (!"LIFETIME".equals(request.billingModel())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        if (request.assetLimit() == null || request.assetLimit() < 1) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        String beforeState = state(v);
        v.setNameVi(request.nameVi().trim());
        v.setNameEn(request.nameEn().trim());
        v.setDescriptionVi(request.descriptionVi() != null ? request.descriptionVi().trim() : null);
        v.setDescriptionEn(request.descriptionEn() != null ? request.descriptionEn().trim() : null);
        v.setPurchasePriceVnd(request.purchasePriceVnd());
        v.setBillingModel("LIFETIME");
        v.setAssetLimit(request.assetLimit());
        v.setStorageLimitBytes(request.storageBytesLimit());
        v.setFileLimitBytes(STANDARD_MAX_FILE_BYTES);
        v.setChangeNote(request.changeNotes());

        try {
            SubscriptionPlanVersion saved = planVersionRepository.saveAndFlush(v);

            Map<String, Object> meta = new HashMap<>();
            meta.put("planCode", normalizedCode);
            meta.put("version", version);
            meta.put("purchasePriceVnd", v.getPurchasePriceVnd());
            meta.put("assetLimit", v.getAssetLimit());
            meta.put("storageBytesLimit", v.getStorageLimitBytes());
            meta.put("ipAddress", ipAddress);
            auditService.record(new AuditEvent(
                AuditAction.SUBSCRIPTION_PLAN_DRAFT_UPDATED,
                AuditActorType.USER,
                adminUserId,
                null,
                "SUBSCRIPTION_PLAN_VERSION",
                saved.getId(),
                beforeState,
                state(saved),
                ipAddress,
                meta,
                null,
                null
            ));

            return toVersionDto(saved);
        } catch (OptimisticLockException | ObjectOptimisticLockingFailureException ex) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_CONFLICT);
        }
    }

    /**
     * Công bố bản nháp ({@code POST /plans/{planCode}/versions/{version}/publish}): khóa gói; version PUBLISHED cũ chuyển DEPRECATED; version này thành PUBLISHED;
     * đồng bộ giá và giới hạn sang {@code subscription_plans} ({@code updatePlanConfig}); audit {@code SUBSCRIPTION_PLAN_PUBLISHED}.
     *
     * @throws com.legacyvault.common.exception.BusinessException PLAN_VERSION_NOT_FOUND, PLAN_VERSION_NOT_EDITABLE (không phải DRAFT), PLAN_VERSION_CONFLICT
     */
    @Transactional
    public SubscriptionPlanVersionDto publishVersion(String planCode, int version, Long adminUserId, String ipAddress) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        activePlanRepository.lockPlan(normalizedCode);

        SubscriptionPlanVersion v = planVersionRepository.findByPlanCodeAndVersion(normalizedCode, version)
            .orElseThrow(() -> new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND));

        if (v.getStatus() != VersionStatus.DRAFT) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_NOT_EDITABLE);
        }

        String beforeState = state(v);
        // Deprecate old published version if present
        Optional<SubscriptionPlanVersion> oldPublished = planVersionRepository.findByPlanCodeAndStatus(normalizedCode, VersionStatus.PUBLISHED);
        if (oldPublished.isPresent()) {
            SubscriptionPlanVersion old = oldPublished.get();
            old.setStatus(VersionStatus.DEPRECATED);
            old.setDeprecatedAt(Instant.now());
            planVersionRepository.saveAndFlush(old);
        }

        v.setStatus(VersionStatus.PUBLISHED);
        v.setPublishedAt(Instant.now());
        v.setPublishedByUserId(adminUserId);

        try {
            SubscriptionPlanVersion saved = planVersionRepository.saveAndFlush(v);

            // Synchronize with active subscription_plans table
            activePlanRepository.updatePlanConfig(
                normalizedCode,
                saved.getVersion(),
                saved.getPurchasePriceVnd(),
                saved.getAssetLimit(),
                saved.getStorageLimitBytes(),
                saved.getFileLimitBytes()
            );

            Map<String, Object> meta = new HashMap<>();
            meta.put("planCode", normalizedCode);
            meta.put("version", version);
            meta.put("purchasePriceVnd", saved.getPurchasePriceVnd());
            meta.put("ipAddress", ipAddress);
            auditService.record(new AuditEvent(
                AuditAction.SUBSCRIPTION_PLAN_PUBLISHED,
                AuditActorType.USER,
                adminUserId,
                null,
                "SUBSCRIPTION_PLAN_VERSION",
                saved.getId(),
                beforeState,
                state(saved),
                ipAddress,
                meta,
                null,
                null
            ));

            return toVersionDto(saved);
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_CONFLICT);
        }
    }

    /**
     * Ngừng một version ({@code POST /plans/{planCode}/versions/{version}/deprecate}): khóa gói; không áp dụng cho BASIC (VALIDATION_FAILED); version DRAFT hoặc đã DEPRECATED
     * -> PLAN_VERSION_NOT_EDITABLE; gọi {@code retire} để gói không còn bán trong catalog; audit {@code SUBSCRIPTION_PLAN_DEPRECATED}.
     */
    @Transactional
    public SubscriptionPlanVersionDto deprecateVersion(String planCode, int version, Long adminUserId, String ipAddress) {
        String normalizedCode = validateAndNormalizePlanCode(planCode);
        activePlanRepository.lockPlan(normalizedCode);

        SubscriptionPlanVersion v = planVersionRepository.findByPlanCodeAndVersion(normalizedCode, version)
            .orElseThrow(() -> new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND));

        if (v.getStatus() == VersionStatus.DEPRECATED || v.getStatus() == VersionStatus.DRAFT) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_NOT_EDITABLE);
        }

        String beforeState = state(v);
        if ("BASIC".equals(normalizedCode)) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        activePlanRepository.retire(normalizedCode, version);
        v.setStatus(VersionStatus.DEPRECATED);
        v.setDeprecatedAt(Instant.now());
        SubscriptionPlanVersion saved = planVersionRepository.saveAndFlush(v);

        Map<String, Object> meta = new HashMap<>();
        meta.put("planCode", normalizedCode);
        meta.put("version", version);
        meta.put("ipAddress", ipAddress);
        auditService.record(new AuditEvent(
            AuditAction.SUBSCRIPTION_PLAN_DEPRECATED,
            AuditActorType.USER,
            adminUserId,
            null,
            "SUBSCRIPTION_PLAN_VERSION",
            saved.getId(),
            beforeState,
            state(saved),
            ipAddress,
            meta,
            null,
            null
        ));

        return toVersionDto(saved);
    }

    /**
     * Tra cứu mức sử dụng và gói hiệu lực của tài khoản ({@code GET /accounts?query=}): tìm theo id số, email hoặc UUID công khai. Giới hạn lấy từ BASIC,
     * trừ khi có đơn thanh toán thành công (khi đó lấy snapshot gói đã mua, trạng thái {@code VERIFIED_VNPAY_PAYMENT}).
     *
     * @param query id số, email hoặc UUID
     * @return {@link AccountUsageLookupDto}
     * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED (rỗng), RESOURCE_NOT_FOUND
     */
    @Transactional(readOnly = true)
    public AccountUsageLookupDto lookupAccount(String query) {
        if (query == null || query.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        String trimmed = query.trim();
        User user = null;

        // Try numeric user ID
        try {
            Long uid = Long.parseLong(trimmed);
            user = userRepository.findById(uid).orElse(null);
        } catch (NumberFormatException ignored) {}

        // Try email
        if (user == null && trimmed.contains("@")) {
            user = userRepository.findByEmail(trimmed).orElse(null);
        }

        // Try public UUID
        if (user == null) {
            try {
                UUID uuid = UUID.fromString(trimmed);
                user = userRepository.findByPublicId(uuid).orElse(null);
            } catch (IllegalArgumentException ignored) {}
        }

        if (user == null) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        Long userId = user.getUserId();
        var observedUsage = ownerUsageRepository.read(userId);
        boolean hasVault = vaultRepository.existsByOwnerUserId(userId);
        String vaultPublicId = null;
        if (hasVault) {
            var vaultPage = vaultRepository.findByOwnerUserId(userId, PageRequest.of(0, 1));
            if (!vaultPage.isEmpty()) {
                vaultPublicId = vaultPage.getContent().get(0).getPublicId().toString();
            }
        }

        SubscriptionPlan basicPlan = activePlanRepository.findById("BASIC").orElse(null);
        long assetLimit = basicPlan != null ? basicPlan.getAssetLimit() : 5L;
        long storageLimit = basicPlan != null ? basicPlan.getStorageLimitBytes() : 104857600L;
        long fileLimit = basicPlan != null ? basicPlan.getFileLimitBytes() : STANDARD_MAX_FILE_BYTES;
        var paid = payments.effective(userId);
        if (paid.isPresent()) {
            assetLimit = paid.get().limits().assetCount();
            storageLimit = paid.get().limits().storageBytes();
            fileLimit = paid.get().limits().fileBytes();
        }

        Instant createdAtInstant = user.getCreatedAt() != null
            ? user.getCreatedAt().toInstant(ZoneOffset.UTC)
            : Instant.now();

        return new AccountUsageLookupDto(
            user.getPublicId() != null ? user.getPublicId().toString() : String.valueOf(user.getUserId()),
            user.getFullName(),
            user.getEmail(),
            user.getStatus() != null ? user.getStatus() : "ACTIVE",
            paid.map(p -> p.code()).orElse("BASIC"),
            paid.map(p -> p.code()).orElse("Gói Cơ bản (Mặc định)"),
            "ACTIVE",
            paid.isPresent() ? "VERIFIED_VNPAY_PAYMENT" : "DEFAULT_BASIC_FREE",
            paid.isPresent() ? null : createdAtInstant,
            null, // Free plan has no expiration
            "LIFETIME",
            observedUsage.assets(),
            assetLimit,
            observedUsage.bytes(),
            storageLimit,
            fileLimit,
            fileLimit,
            hasVault,
            vaultPublicId
        );
    }

    /**
     * Tra cứu giao dịch với tham số mặc định (trang 0, kích thước 20), chỉ lọc theo {@code query}.
     */
    @Transactional(readOnly = true, isolation = Isolation.SERIALIZABLE)
    public PageEnvelope<Transaction> lookupTransactions(String query) {
        return lookupTransactions(query,null,null,null,null,0,20);
    }

    /**
     * Tra cứu giao dịch có lọc và phân trang ({@code GET /transactions}), isolation SERIALIZABLE để đếm và phân trang nhất quán khi IPN đang đổi dữ liệu.
     * Kiểm tra: page >= 0, size 1..100, from < to, query <= 254 ký tự không có ký tự điều khiển, status thuộc PENDING, SUCCEEDED, FAILED, EXPIRED.
     *
     * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED, PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE (lỗi truy cập dữ liệu)
     */
    @Transactional(readOnly = true, isolation = Isolation.SERIALIZABLE)
    public PageEnvelope<Transaction> lookupTransactions(
            String query, UUID accountId, String status, Instant from, Instant to, int page, int size) {
        if(page<0 || size<1 || size>100 || (from!=null && to!=null && !from.isBefore(to)))
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        if(query!=null) {
            query=query.trim();
            if(query.length()>254 || query.codePoints().anyMatch(Character::isISOControl)) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            if(query.isEmpty()) query=null;
        }
        if(status!=null && !Set.of("PENDING","SUCCEEDED","FAILED","EXPIRED").contains(status))
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        try {
            return payments.adminList(new Filter(query,accountId,status,from,to,page,size),Instant.now());
        } catch(DataAccessException unavailable) {
            throw new BusinessException(ErrorCode.PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE);
        }
    }

    /**
     * Chi tiết một giao dịch ({@code GET /transactions/{paymentId}}).
     *
     * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND, PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE
     */
    @Transactional(readOnly = true)
    public Transaction transactionDetail(UUID paymentId) {
        try {return payments.adminDetail(paymentId,Instant.now()).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));}
        catch(DataAccessException unavailable) {throw new BusinessException(ErrorCode.PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE);}
    }

    /**
     * Chuẩn hóa mã gói (trim, chữ hoa) và kiểm tra thuộc BASIC / STANDARD / EXTENDED.
     *
     * @throws com.legacyvault.common.exception.BusinessException PLAN_VERSION_NOT_FOUND nếu rỗng hoặc không hợp lệ
     */
    private String validateAndNormalizePlanCode(String planCode) {
        if (planCode == null || planCode.isBlank()) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND);
        }
        String normalized = planCode.trim().toUpperCase();
        if (!ALLOWED_PLANS.contains(normalized)) {
            throw new BusinessException(ErrorCode.PLAN_VERSION_NOT_FOUND);
        }
        return normalized;
    }

    /**
     * Chuyển entity version sang DTO (giá tháng legacy chỉ trả với billing MONTHLY).
     */
    private SubscriptionPlanVersionDto toVersionDto(SubscriptionPlanVersion entity) {
        return new SubscriptionPlanVersionDto(
            entity.getId(),
            entity.getPlanCode(),
            entity.getVersion(),
            entity.getStatus().name(),
            entity.getNameVi(),
            entity.getNameEn(),
            entity.getDescriptionVi(),
            entity.getDescriptionEn(),
            entity.getPurchasePriceVnd(),
            entity.getBillingModel(),
            entity.getAssetLimit(),
            entity.getStorageLimitBytes(),
            entity.getFileLimitBytes(),
            entity.getConcurrencyToken(),
            entity.getChangeNote(),
            entity.getPublishedAt(),
            entity.getPublishedByUserId(),
            entity.getCreatedAt(),
            entity.getUpdatedAt(),
            "MONTHLY".equals(entity.getBillingModel()) ? entity.getLegacyMonthlyPriceVnd() : null
        );
    }
    /**
     * Tuần tự hóa các trường quan trọng của version thành JSON để lưu làm trạng thái trước / sau trong audit.
     *
     * @throws IllegalStateException nếu không serialize được
     */
    private String state(SubscriptionPlanVersion v) {
        Map<String,Object> fields = new LinkedHashMap<>();
        fields.put("planCode", v.getPlanCode()); fields.put("version", v.getVersion());
        fields.put("status", v.getStatus().name()); fields.put("nameVi",v.getNameVi()); fields.put("nameEn",v.getNameEn());
        fields.put("descriptionVi",v.getDescriptionVi()); fields.put("descriptionEn",v.getDescriptionEn());
        fields.put("purchasePriceVnd",v.getPurchasePriceVnd()); fields.put("billingModel",v.getBillingModel());
        fields.put("assetLimit",v.getAssetLimit()); fields.put("storageBytesLimit",v.getStorageLimitBytes());
        fields.put("fileBytesLimit",v.getFileLimitBytes()); fields.put("changeNotes",v.getChangeNote());
        try { return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(fields); }
        catch (Exception e) { throw new IllegalStateException("Cannot serialize subscription audit state",e); }
    }
}

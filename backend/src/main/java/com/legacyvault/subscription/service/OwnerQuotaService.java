package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.repository.OwnerUsageRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import com.legacyvault.subscription.service.QuotaPolicy.*;
import com.legacyvault.user.repository.OwnerWriteLockRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;

/**
 * Thực thi quota (số Asset, dung lượng, kích thước file) cho Owner và cung cấp catalog / gói hiệu lực. Được {@code AssetService},
 * {@code AssetDocumentService}, {@code AssetImageService}, {@code WillService} gọi trước mọi thao tác ghi, và {@code SubscriptionController} gọi để đọc.
 *
 * <p>Quyền trả phí chỉ đến từ đơn thanh toán VNPay đã xác minh ({@code PaymentRepository.effective}); không có thì dùng gói BASIC.
 * Các hàm kiểm tra bắt buộc chạy trong giao dịch của caller ({@code Propagation.MANDATORY}) để kiểm tra và ghi cùng một giao dịch.
 */
@Service
public class OwnerQuotaService {
    /**
     * Khóa dòng Owner khi ghi.
     */
    private final OwnerWriteLockRepository ownerLocks;
    /**
     * Catalog gói.
     */
    private final SubscriptionPlanRepository plans;
    /**
     * Đọc mức sử dụng hiện tại.
     */
    private final OwnerUsageRepository usage;
    /**
     * Kiểm tra Owner đã có Vault chưa.
     */
    private final VaultRepository vaults;
    /**
     * Tìm gói hiệu lực theo đơn thanh toán thành công.
     */
    private final com.legacyvault.subscription.repository.PaymentRepository payments;
    /**
     * PS-92 (D-API-42): giới hạn catalog trọn đời được áp dụng mặc định ({@code legacyvault.subscription.quota-enforcement-enabled=true}); cờ này chỉ là công tắc tắt khẩn cấp khi vận hành.
     */
    @org.springframework.beans.factory.annotation.Value("${legacyvault.subscription.quota-enforcement-enabled:true}")
    private boolean enforcementEnabled = true;

    /**
     * Ném SUBSCRIPTION_POLICY_PENDING nếu việc thực thi quota đang bị tắt bằng cờ vận hành.
     *
     * @throws com.legacyvault.common.exception.BusinessException SUBSCRIPTION_POLICY_PENDING
     */
    public void requirePrototypeEnabled() {
        if (!enforcementEnabled) throw new BusinessException(ErrorCode.SUBSCRIPTION_POLICY_PENDING);
    }

    /**
     * Bộ tính toán quota thuần (không truy cập DB).
     */
    private final QuotaPolicy policy = new QuotaPolicy();

    /**
     * Khởi tạo service với các repository do Spring inject.
     */
    public OwnerQuotaService(OwnerWriteLockRepository ownerLocks, SubscriptionPlanRepository plans,
                             OwnerUsageRepository usage, VaultRepository vaults,
                             com.legacyvault.subscription.repository.PaymentRepository payments) {
        this.ownerLocks = ownerLocks;
        this.plans = plans;
        this.usage = usage;
        this.vaults = vaults;
        this.payments = payments;
    }

    /**
     * Khóa dòng Owner đang hoạt động (PESSIMISTIC) - phải gọi trước mọi khóa ghi tài nguyên và giữ tới khi caller commit; nhờ đó các thay đổi của một Owner được tuần tự hóa.
     *
     * @param ownerUserId id Owner
     * @throws com.legacyvault.common.exception.BusinessException UNAUTHENTICATED nếu Owner không tồn tại / không hoạt động
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockOwner(Long ownerUserId) {
        ownerLocks.findActiveOwnerForUpdate(ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
    }

    /**
     * Kiểm tra mức tăng ({@code delta}) không làm vượt giới hạn của gói hiệu lực. Caller đang giữ khóa Owner; không dùng REQUIRES_NEW nên kiểm tra và ghi
     * cùng một giao dịch. Giảm hoặc giữ nguyên mức dùng luôn được phép.
     *
     * @param delta mức tăng số Asset và byte
     * @throws com.legacyvault.common.exception.BusinessException ASSET_QUOTA_EXCEEDED hoặc STORAGE_QUOTA_EXCEEDED
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireGrowth(Long ownerUserId, Delta delta) {
        if (!enforcementEnabled) return;
        Plan plan = effective(ownerUserId);
        Decision decision = policy.evaluate(usage.read(ownerUserId),
                new QuotaPolicy.Limits(plan.limits().assetCount(), plan.limits().storageBytes()), delta);
        if (decision.assetLimitExceeded()) throw new BusinessException(ErrorCode.ASSET_QUOTA_EXCEEDED);
        if (decision.storageLimitExceeded()) throw new BusinessException(ErrorCode.STORAGE_QUOTA_EXCEEDED);
    }

    /**
     * Kiểm tra một file không vượt dung lượng tối đa mỗi file của gói hiệu lực.
     *
     * @param bytes kích thước file
     * @throws com.legacyvault.common.exception.BusinessException PAYLOAD_TOO_LARGE
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireFileSize(Long ownerUserId, long bytes) {
        if (!enforcementEnabled) return;
        if (bytes > effective(ownerUserId).limits().fileBytes()) throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE);
    }

    /**
     * Catalog gói đang khả dụng ({@code GET /api/v1/subscription-plans}), giới hạn Asset tăng dần.
     */
    @Transactional(readOnly = true)
    public List<Plan> catalog() {
        return plans.findAllByOrderByAssetLimitAsc().stream().filter(SubscriptionPlan::isAvailable).map(Plan::from).toList();
    }

    /**
     * Gói hiệu lực + mức sử dụng của Owner ({@code GET /api/v1/subscriptions/me}): khóa Owner, đọc mức dùng và số di chúc, so sánh với giới hạn để đặt cờ vượt quota.
     *
     * @return {@link Current}
     */
    @Transactional
    public Current current(Long ownerUserId) {
        lockOwner(ownerUserId);
        Plan plan = effective(ownerUserId);
        Usage observed = usage.read(ownerUserId);
        long wills = usage.willCount(ownerUserId);
        return new Current(plan, null, UsageView.from(observed, wills),
                new OverQuota(observed.assets() > plan.limits().assetCount(), observed.bytes() > plan.limits().storageBytes()),
                vaults.existsByOwnerUserId(ownerUserId), Instant.now());
    }

    /**
     * Gói hiệu lực: đơn thanh toán thành công mạnh nhất, nếu không có thì BASIC. Không bao giờ tin các dòng tự cấp trước khi duyệt làm bằng chứng thanh toán.
     */
    private Plan effective(Long ownerUserId) {
        // Never trust pre-review self-granted rows as proof of payment/authorization.
        return payments.effective(ownerUserId).orElseGet(() -> Plan.from(basic()));
    }

    /**
     * Gói BASIC trong catalog; thiếu thì ném {@link IllegalStateException} vì đây là dữ liệu bắt buộc.
     */
    private SubscriptionPlan basic() {
        return plans.findById("BASIC").orElseThrow(() -> new IllegalStateException("BASIC catalog entry is required"));
    }
}

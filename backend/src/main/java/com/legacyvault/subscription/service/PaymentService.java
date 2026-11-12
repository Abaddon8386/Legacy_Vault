package com.legacyvault.subscription.service;

import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.repository.*;
import com.legacyvault.subscription.repository.PaymentRepository.Payment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import java.time.*;
import java.time.format.*;
import java.util.*;

/**
 * Vòng đời đơn thanh toán nâng cấp gói qua VNPay (PS-80): tạo đơn, đọc, xử lý IPN, đóng đơn khi thất bại và đối soát QueryDR. Được
 * {@code PaymentController} và {@code PaymentReconciliationService} gọi. Bảng {@code subscription_payments}. Audit {@code SUBSCRIPTION_PAYMENT_CREATED},
 * {@code SUBSCRIPTION_PAYMENT_SUCCEEDED}, {@code SUBSCRIPTION_PAYMENT_FAILED}.
 *
 * <p>Nguyên tắc: trình duyệt không bao giờ cấp được gói; chỉ IPN hoặc QueryDR đã xác minh chữ ký mới chốt đơn thành công. Không gọi mạng thanh toán trong giao dịch.
 */
@Service
public class PaymentService {
    /**
     * Truy cập bảng đơn thanh toán.
     */
    private final PaymentRepository payments;
    /**
     * Catalog gói (chụp giá lúc tạo đơn).
     */
    private final SubscriptionPlanRepository plans;
    /**
     * Khóa Owner và đọc gói hiện tại.
     */
    private final OwnerQuotaService quotas;
    /**
     * Tạo URL checkout và xác minh chữ ký.
     */
    private final VnPayGateway gateway;
    /**
     * Ghi audit.
     */
    private final AuditService audit;
    /**
     * Khởi tạo service với các phụ thuộc do Spring inject.
     */
    public PaymentService(PaymentRepository payments,SubscriptionPlanRepository plans,OwnerQuotaService quotas,VnPayGateway gateway,AuditService audit) {
        this.payments=payments;this.plans=plans;this.quotas=quotas;this.gateway=gateway;this.audit=audit;
    }
    /**
     * Body tạo đơn: {@code planCode}, {@code catalogVersion} (>= 1) và {@code idempotencyKey} (UUID do client sinh, để gửi lại không tạo đơn trùng); cả ba bắt buộc.
     */
    public record CheckoutRequest(@jakarta.validation.constraints.NotNull PlanCode planCode,
        @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(1) Integer catalogVersion,
        @jakarta.validation.constraints.NotNull UUID idempotencyKey) {}
    /**
     * Đơn thanh toán trả cho client: id, gói, version catalog, số tiền VND, tiền tệ, mô hình thu phí, trạng thái (PENDING quá hạn hiển thị EXPIRED), thời điểm tạo / hết hạn và {@code checkoutUrl} (chỉ có khi đơn còn PENDING và vừa tạo / gửi lại).
     */
    public record PaymentView(UUID paymentId,String planCode,int catalogVersion,long amountVnd,String currency,
        String billingModel,String status,Instant createdAt,Instant expiresAt,String checkoutUrl) {}
    /**
     * Phản hồi cho VNPay: {@code RspCode} (00 thành công, 01 không thấy đơn, 02 đã xác nhận, 04 sai số tiền, 97 sai chữ ký, 99 thử lại sau) và {@code Message}.
     */
    public record IpnResult(@com.fasterxml.jackson.annotation.JsonProperty("RspCode") String code,
        @com.fasterxml.jackson.annotation.JsonProperty("Message") String message) {}
    /**
     * Tạo đơn thanh toán ({@code POST /api/v1/subscriptions/me/payments}).
     *
     * Các bước: cổng phải khả dụng -> khóa Owner -> nếu cùng idempotencyKey đã có thì trả lại đơn cũ (khác gói / version -> PAYMENT_REQUEST_CONFLICT) ->
     * không cho có đơn PENDING khác -> khóa gói để tuần tự hóa với admin publish -> kiểm tra version catalog (SUBSCRIPTION_CATALOG_STALE) và chỉ cho nâng cấp lên bậc cao hơn
     * -> chụp giá / giới hạn vào đơn PENDING hiệu lực 900 giây -> audit {@code SUBSCRIPTION_PAYMENT_CREATED}.
     *
     * @param owner id Owner
     * @param request dữ liệu tạo đơn
     * @param ip IP khách gửi cho VNPay
     * @return {@link PaymentView} kèm URL checkout
     * @throws com.legacyvault.common.exception.BusinessException PAYMENT_REQUEST_CONFLICT, SUBSCRIPTION_CATALOG_STALE, SUBSCRIPTION_UPGRADE_UNAVAILABLE, SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED, RESOURCE_NOT_FOUND
     */
    @Transactional
    public PaymentView create(long owner,CheckoutRequest request,String ip) {
        gateway.requireAvailable();
        quotas.lockOwner(owner);
        var existing=payments.byKey(owner,request.idempotencyKey());
        if(existing.isPresent()) {
            var p=existing.get();
            if(!p.plan().code().equals(request.planCode().name()) || p.plan().version()!=request.catalogVersion())
                throw new BusinessException(ErrorCode.PAYMENT_REQUEST_CONFLICT);
            return view(p,ip);
        }
        var now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        if(payments.pending(owner,now)) throw new BusinessException(ErrorCode.PAYMENT_REQUEST_CONFLICT);
        // Serialize price snapshot with admin publication. No payment network call inside transaction.
        plans.lockPlan(request.planCode().name());
        var target=plans.findById(request.planCode().name()).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if(!target.isAvailable() || target.getVersion()!=request.catalogVersion()) throw new BusinessException(ErrorCode.SUBSCRIPTION_CATALOG_STALE);
        SubscriptionUpgradeService.fullTargetPrice(quotas.current(owner).effectivePlan().code(),target.getCode(),target.getPriceVnd());
        if(target.getPriceVnd()>9999999999L) throw new BusinessException(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE);
        var p=new Payment(UUID.randomUUID(),owner,request.idempotencyKey(),Plan.from(target),gateway.merchant(),"PENDING",now,now.plusSeconds(900),null);
        payments.insert(p);
        audit(p,AuditAction.SUBSCRIPTION_PAYMENT_CREATED,AuditActorType.USER,owner,ip);
        return view(p,ip);
    }
    /**
     * Đọc đơn của chính Owner (không kèm URL checkout).
     *
     * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND
     */
    @Transactional(readOnly=true)
    public PaymentView read(long owner,UUID id) {
        var p=payments.find(id).filter(x->x.owner()==owner).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return view(p,null);
    }
    /**
     * Dựng {@link PaymentView}: PENDING đã hết hạn hiển thị EXPIRED; chỉ sinh {@code checkoutUrl} khi có IP, đơn còn PENDING và đúng merchant hiện tại.
     */
    private PaymentView view(Payment p,String ip) {
        String status=p.status().equals("PENDING") && !Instant.now().isBefore(p.expires())?"EXPIRED":p.status();
        String url=ip!=null && status.equals("PENDING") && p.merchant().equals(gateway.merchant())
            ? gateway.checkout(p.id(),p.plan().priceVnd(),p.created(),p.expires(),ip):null;
        return new PaymentView(p.id(),p.plan().code(),p.plan().version(),p.plan().priceVnd(),"VND","LIFETIME",status,p.created(),p.expires(),url);
    }
    /**
     * Xử lý IPN của VNPay ({@code GET /api/v1/payments/vnpay/ipn}): xác minh chữ ký rồi áp dụng. Sai chữ ký trả mã 97.
     *
     * @param query tham số {@code vnp_*} VNPay gửi
     * @return {@link IpnResult}
     */
    @Transactional
    public IpnResult ipn(MultiValueMap<String,String> query) {
        var verified=gateway.verified(query);
        if(verified.isEmpty()) return result("97");
        return applyVerified(verified.get(), "VERIFIED_IPN_ONLY");
    }
    /**
     * Trình duyệt quay về với kết quả thất bại / hủy đã ký: chữ ký VNPay đủ tin cậy để đóng đơn, nhưng trình duyệt không bao giờ cấp được gói - thành công phải đến từ IPN hoặc QueryDR.
     * Đơn phải của Owner, {@code vnp_TxnRef} khớp, không phải mã thành công và trạng thái giao dịch là 02 (hủy / thất bại); nếu không trả mã lỗi.
     *
     * @param owner id Owner
     * @param paymentId payment id
     * @param query query đã ký VNPay trả về
     * @return {@link IpnResult}
     */
    @Transactional
    public IpnResult recordReturnFailure(long owner, UUID paymentId, MultiValueMap<String,String> query) {
        payments.find(paymentId).filter(p -> p.owner()==owner)
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var verified = gateway.verified(query);
        if (verified.isEmpty()) return result("97");
        var fields = verified.get();
        if (!paymentId.toString().replace("-", "").equals(fields.get("vnp_TxnRef"))) return result("01");
        if ("00".equals(fields.get("vnp_ResponseCode")) || !"02".equals(fields.get("vnp_TransactionStatus"))) return result("99");
        return applyVerified(fields, "VERIFIED_RETURN_FAILURE");
    }
    /**
     * Đối soát chỉ qua server-to-server QueryDR; tham số trả về của trình duyệt không thể gọi đường hoàn tất này. Xác minh chữ ký phản hồi, {@code vnp_TxnRef} khớp,
     * và chỉ coi là cuối cùng khi là lệnh querydr, loại giao dịch thanh toán (01) thành công (trạng thái 00). Mã phản hồi của truy vấn mô tả truy vấn, không mô tả khoản thu.
     *
     * @param response phản hồi JSON của QueryDR
     * @return {@link IpnResult}
     */
    @Transactional
    public IpnResult reconcile(long owner, UUID paymentId, Map<?,?> response) {
        payments.find(paymentId).filter(p -> p.owner()==owner)
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var verified = gateway.verifiedQuery(response);
        if (verified.isEmpty()) return result("97");
        var fields = verified.get();
        if (!paymentId.toString().replace("-", "").equals(fields.get("vnp_TxnRef"))) return result("01");
        // Query ResponseCode describes the query, not the charge. Only verified successful PAY is final here.
        if (!"querydr".equals(fields.get("vnp_Command")) || !"00".equals(fields.get("vnp_ResponseCode"))
            || !"01".equals(fields.get("vnp_TransactionType")) || !"00".equals(fields.get("vnp_TransactionStatus")))
            return result("99");
        return applyVerified(fields, "VERIFIED_QUERYDR");
    }
    /**
     * Áp dụng dữ liệu đã xác minh chữ ký vào đơn: kiểm tra merchant, định dạng mã tham chiếu, số tiền (x100) và tiền tệ, mã phản hồi; chỉ chuyển PENDING sang SUCCEEDED / FAILED
     * (đơn FAILED chỉ được mở lại khi cổng xác nhận thành công - khách có thể đã trả ở tab khác; SUCCEEDED là cuối cùng); thành công cần mã giao dịch hợp lệ và giờ thanh toán trong cửa sổ
     * checkout. Khóa Owner trước khi sửa đơn, sau đó {@code payments.complete} và audit.
     *
     * @param verificationSource nguồn xác minh ghi vào audit (VERIFIED_IPN_ONLY, VERIFIED_RETURN_FAILURE, VERIFIED_QUERYDR)
     * @return {@link IpnResult} theo mã của VNPay
     */
    private IpnResult applyVerified(Map<String,String> f, String verificationSource) {
        if(!gateway.merchant().equals(f.get("vnp_TmnCode"))) return result("97");
        UUID id;
        try {
            String reference=f.getOrDefault("vnp_TxnRef","");
            if(!reference.matches("[a-f0-9]{32}")) return result("01");
            id=UUID.fromString(reference.replaceFirst("(.{8})(.{4})(.{4})(.{4})(.{12})","$1-$2-$3-$4-$5"));
        }
        catch(IllegalArgumentException e) { return result("01"); }
        var found=payments.find(id);
        if(found.isEmpty()) return result("01");
        payments.lockOwner(found.get().owner());
        var p=payments.find(id).orElseThrow();
        if(!p.merchant().equals(f.get("vnp_TmnCode"))) return result("97");
        if(!Long.toString(p.plan().priceVnd()*100).equals(f.get("vnp_Amount"))
            || (f.containsKey("vnp_CurrCode") && !"VND".equals(f.get("vnp_CurrCode")))) return result("04");
        String code=f.getOrDefault("vnp_ResponseCode",""), state=f.getOrDefault("vnp_TransactionStatus","");
        if(!code.matches("[0-9]{2}") || !state.matches("[0-9]{2}")) return result("99");
        boolean success=code.equals("00") && state.equals("00");
        // A closed (FAILED) order is reopened only by a verified gateway success (IPN or QueryDR): the customer may have
        // paid in another tab after cancelling. SUCCEEDED stays final; a failure never changes a closed order.
        boolean paidAfterClose=success && p.status().equals("FAILED");
        if(!p.status().equals("PENDING") && !paidAfterClose) return result("02");
        // Intermediate/inconsistent statuses must not turn a processing payment into a terminal failure.
        if(!success && !(state.equals("02") && !code.equals("00"))) return result("99");
        String number=f.getOrDefault("vnp_TransactionNo","");
        if(success) {
            if(!number.matches("[1-9][0-9]{0,14}")) return result("99");
            try {
                Instant paid=LocalDateTime.parse(f.getOrDefault("vnp_PayDate",""),
                    DateTimeFormatter.ofPattern("uuuuMMddHHmmss").withResolverStyle(ResolverStyle.STRICT))
                    .atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant();
                // Late IPN is valid if gateway payment occurred within the checkout window.
                if(paid.isBefore(p.created()) || paid.isAfter(p.expires()) || paid.isAfter(Instant.now().plusSeconds(60))) return result("99");
            } catch(DateTimeException e) { return result("99"); }
        }
        payments.complete(id,success?"SUCCEEDED":"FAILED",success?number:null,code,state);
        audit(p,success?AuditAction.SUBSCRIPTION_PAYMENT_SUCCEEDED:AuditAction.SUBSCRIPTION_PAYMENT_FAILED,AuditActorType.SYSTEM,null,null,verificationSource);
        return result("00");
    }
    /**
     * Ghi audit sự kiện thanh toán với nguồn xác minh mặc định {@code VERIFIED_IPN_ONLY}.
     */
    private void audit(Payment p,AuditAction action,AuditActorType actor,Long user,String ip) {
        audit(p,action,actor,user,ip,"VERIFIED_IPN_ONLY");
    }
    /**
     * Ghi audit sự kiện thanh toán (entity {@code SUBSCRIPTION_PAYMENT}, bước PS-80) kèm paymentId, planCode, amountVnd; không chứa dữ liệu nhạy cảm của cổng.
     */
    private void audit(Payment p,AuditAction action,AuditActorType actor,Long user,String ip,String verificationSource) {
        audit.record(new AuditEvent(action,actor,user,null,"SUBSCRIPTION_PAYMENT",null,null,null,ip,
            Map.of("paymentId",p.id().toString(),"planCode",p.plan().code(),"amountVnd",p.plan().priceVnd()),"PS-80",verificationSource));
    }
    /**
     * Dựng {@link IpnResult} với thông điệp tương ứng mã VNPay.
     */
    private static IpnResult result(String code) {
        return new IpnResult(code,switch(code) {case "00"->"Confirm Success";case "01"->"Order not found";
            case "02"->"Order already confirmed";case "04"->"Invalid amount";case "97"->"Invalid signature";default->"Retry later";});
    }
}

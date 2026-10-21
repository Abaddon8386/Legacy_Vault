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

@Service
public class PaymentService {
    private final PaymentRepository payments;
    private final SubscriptionPlanRepository plans;
    private final OwnerQuotaService quotas;
    private final VnPayGateway gateway;
    private final AuditService audit;
    public PaymentService(PaymentRepository payments,SubscriptionPlanRepository plans,OwnerQuotaService quotas,VnPayGateway gateway,AuditService audit) {
        this.payments=payments;this.plans=plans;this.quotas=quotas;this.gateway=gateway;this.audit=audit;
    }
    public record CheckoutRequest(@jakarta.validation.constraints.NotNull PlanCode planCode,
        @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(1) Integer catalogVersion,
        @jakarta.validation.constraints.NotNull UUID idempotencyKey) {}
    public record PaymentView(UUID paymentId,String planCode,int catalogVersion,long amountVnd,String currency,
        String billingModel,String status,Instant createdAt,Instant expiresAt,String checkoutUrl) {}
    public record IpnResult(@com.fasterxml.jackson.annotation.JsonProperty("RspCode") String code,
        @com.fasterxml.jackson.annotation.JsonProperty("Message") String message) {}
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
    @Transactional(readOnly=true)
    public PaymentView read(long owner,UUID id) {
        var p=payments.find(id).filter(x->x.owner()==owner).orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return view(p,null);
    }
    private PaymentView view(Payment p,String ip) {
        String status=p.status().equals("PENDING") && !Instant.now().isBefore(p.expires())?"EXPIRED":p.status();
        String url=ip!=null && status.equals("PENDING") && p.merchant().equals(gateway.merchant())
            ? gateway.checkout(p.id(),p.plan().priceVnd(),p.created(),p.expires(),ip):null;
        return new PaymentView(p.id(),p.plan().code(),p.plan().version(),p.plan().priceVnd(),"VND","LIFETIME",status,p.created(),p.expires(),url);
    }
    @Transactional
    public IpnResult ipn(MultiValueMap<String,String> query) {
        var verified=gateway.verified(query);
        if(verified.isEmpty()) return result("97");
        var f=verified.get();
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
        if(!p.status().equals("PENDING")) return result("02");
        boolean success=code.equals("00") && state.equals("00");
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
        audit(p,success?AuditAction.SUBSCRIPTION_PAYMENT_SUCCEEDED:AuditAction.SUBSCRIPTION_PAYMENT_FAILED,AuditActorType.SYSTEM,null,null);
        return result("00");
    }
    private void audit(Payment p,AuditAction action,AuditActorType actor,Long user,String ip) {
        audit.record(new AuditEvent(action,actor,user,null,"SUBSCRIPTION_PAYMENT",null,null,null,ip,
            Map.of("paymentId",p.id().toString(),"planCode",p.plan().code(),"amountVnd",p.plan().priceVnd()),"PS-80","VERIFIED_IPN_ONLY"));
    }
    private static IpnResult result(String code) {
        return new IpnResult(code,switch(code) {case "00"->"Confirm Success";case "01"->"Order not found";
            case "02"->"Order already confirmed";case "04"->"Invalid amount";case "97"->"Invalid signature";default->"Retry later";});
    }
}

package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.repository.PaymentRepository;
import java.net.http.HttpClient;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Khôi phục IPN bị lỡ bằng QueryDR có xác thực của VNPay. Không có giao dịch DB nào bao trùm cuộc gọi mạng. Được {@code PaymentController.read}
 * ({@code GET /api/v1/subscriptions/me/payments/{id}}) gọi; kết quả xác minh được áp dụng qua {@link PaymentService#reconcile}.
 */
@Service
public class PaymentReconciliationService {
    /**
     * Endpoint QueryDR của VNPay sandbox.
     */
    private static final String QUERY_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
    /**
     * Logger; không bao giờ log payload hay bí mật của nhà cung cấp.
     */
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PaymentReconciliationService.class);
    /**
     * Đọc đơn thanh toán.
     */
    private final PaymentRepository repository;
    /**
     * Dựng và xác minh yêu cầu / phản hồi QueryDR.
     */
    private final VnPayGateway gateway;
    /**
     * Áp dụng kết quả đã xác minh.
     */
    private final PaymentService payments;
    /**
     * Hàm gửi POST QueryDR (tách riêng để test).
     */
    private final Function<Map<String,String>,Map<?,?>> transport;
    /**
     * Đồng hồ (tiêm được để test).
     */
    private final Clock clock;
    /**
     * Thời điểm sớm nhất được hỏi lại cho từng đơn (giãn cách 60 giây, tối đa 4096 mục).
     */
    private final ConcurrentHashMap<UUID,Instant> nextQueries = new ConcurrentHashMap<>();

    /**
     * Constructor dùng trong production: HTTP transport thật và đồng hồ hệ thống.
     */
    @Autowired
    public PaymentReconciliationService(PaymentRepository repository, VnPayGateway gateway, PaymentService payments) {
        this(repository,gateway,payments,httpTransport(),Clock.systemUTC());
    }
    /**
     * Constructor nhận transport và clock tùy chỉnh (dùng cho test).
     */
    PaymentReconciliationService(PaymentRepository repository,VnPayGateway gateway,PaymentService payments,
            Function<Map<String,String>,Map<?,?>> transport,Clock clock) {
        this.repository=repository; this.gateway=gateway; this.payments=payments; this.transport=transport; this.clock=clock;
    }
    /**
     * Tạo transport HTTP thật: timeout kết nối 3 giây, đọc 5 giây, không theo redirect; POST JSON tới {@link #QUERY_URL}.
     */
    private static Function<Map<String,String>,Map<?,?>> httpTransport() {
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(5));
        var rest=RestClient.builder().requestFactory(factory).build();
        return body -> rest.post().uri(QUERY_URL).contentType(MediaType.APPLICATION_JSON)
            .body(body).retrieve().body(Map.class);
    }
    /**
     * Đọc đơn của Owner, kèm đối soát nếu cần.
     *
     * Chỉ hỏi QueryDR khi: cổng khả dụng, đơn của đúng merchant, còn PENDING, đã tạo hơn 10 giây và {@link #claim} cho phép (tối đa 1 lần / 60 giây / đơn).
     * Lỗi mạng chỉ cảnh báo, đơn giữ PENDING để lần đọc sau thử lại. Luôn trả trạng thái hiện tại từ {@link PaymentService#read}.
     *
     * @param owner id Owner
     * @param id payment id
     * @return {@link PaymentService.PaymentView}
     * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND nếu đơn không phải của Owner
     */
    public PaymentService.PaymentView read(long owner,UUID id) {
        var payment=repository.find(id).filter(p -> p.owner()==owner)
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Instant now=clock.instant();
        if (gateway.available() && gateway.merchant().equals(payment.merchant()) && "PENDING".equals(payment.status())
                && !payment.created().isAfter(now.minusSeconds(10))
                && claim(id,now)) {
            try {
                // Local sandbox server address; never accept a browser supplied callback or query payload.
                var response=transport.apply(gateway.queryRequest(id,payment.created(),now,"127.0.0.1"));
                payments.reconcile(owner,id,response);
            } catch (RuntimeException unavailable) {
                // Keep pending, preserve the payment and let a later read retry. Never log provider payload/secrets.
                LOG.warn("VNPay reconciliation unavailable; payment remains subject to verified confirmation");
            }
        }
        return payments.read(owner,id);
    }
    /**
     * Giành quyền hỏi QueryDR cho đơn: nguyên tử, chỉ thành công nếu chưa có lần hỏi nào trong 60 giây gần nhất; dọn các mục đã hết hạn khi map đầy (4096).
     */
    private boolean claim(UUID id,Instant now) {
        if (nextQueries.size()>=4096) {
            nextQueries.entrySet().removeIf(e -> !e.getValue().isAfter(now));
            if (nextQueries.size()>=4096) return false;
        }
        var claimed=new AtomicBoolean();
        nextQueries.compute(id,(key,next) -> {
            if (next==null || !next.isAfter(now)) { claimed.set(true); return now.plusSeconds(60); }
            return next;
        });
        return claimed.get();
    }
}

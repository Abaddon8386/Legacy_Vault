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

/** Recover a missed IPN via authenticated VNPay QueryDR. No database transaction spans the network call. */
@Service
public class PaymentReconciliationService {
    private static final String QUERY_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PaymentReconciliationService.class);
    private final PaymentRepository repository;
    private final VnPayGateway gateway;
    private final PaymentService payments;
    private final Function<Map<String,String>,Map<?,?>> transport;
    private final Clock clock;
    private final ConcurrentHashMap<UUID,Instant> nextQueries = new ConcurrentHashMap<>();

    @Autowired
    public PaymentReconciliationService(PaymentRepository repository, VnPayGateway gateway, PaymentService payments) {
        this(repository,gateway,payments,httpTransport(),Clock.systemUTC());
    }
    PaymentReconciliationService(PaymentRepository repository,VnPayGateway gateway,PaymentService payments,
            Function<Map<String,String>,Map<?,?>> transport,Clock clock) {
        this.repository=repository; this.gateway=gateway; this.payments=payments; this.transport=transport; this.clock=clock;
    }
    private static Function<Map<String,String>,Map<?,?>> httpTransport() {
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory=new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(5));
        var rest=RestClient.builder().requestFactory(factory).build();
        return body -> rest.post().uri(QUERY_URL).contentType(MediaType.APPLICATION_JSON)
            .body(body).retrieve().body(Map.class);
    }
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

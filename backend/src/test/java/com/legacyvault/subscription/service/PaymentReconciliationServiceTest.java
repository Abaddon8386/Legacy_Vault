package com.legacyvault.subscription.service;

import com.legacyvault.subscription.repository.PaymentRepository;
import com.legacyvault.subscription.repository.PaymentRepository.Payment;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentReconciliationServiceTest {
    final Instant now=Instant.parse("2026-10-26T01:00:00Z");
    final UUID id=UUID.randomUUID();
    final PaymentRepository repository=mock(PaymentRepository.class);
    final PaymentService payments=mock(PaymentService.class);
    final VnPayGateway gateway=new VnPayGateway(true,"TEST1234","sandbox-test-secret-not-a-real-key","http://localhost:5196/subscription");
    Payment row(String state,Instant created) {
        return new Payment(id,1L,UUID.randomUUID(),new Plan("STANDARD",3,499000,"LIFETIME",new Limits(50,1073741824,10485760)),
            "TEST1234",state,created,created.plusSeconds(900),null);
    }
    @Test void onlyOwnPendingOrdersAreQueriedAndRepeatedReadsAreThrottled() {
        when(repository.find(id)).thenReturn(Optional.of(row("PENDING",now.minusSeconds(60))));
        var calls=new AtomicInteger();
        var service=new PaymentReconciliationService(repository,gateway,payments,body -> {
            calls.incrementAndGet(); assertEquals("querydr",body.get("vnp_Command"));
            assertEquals(id.toString().replace("-",""),body.get("vnp_TxnRef"));return Map.of();
        },Clock.fixed(now,ZoneOffset.UTC));
        assertThrows(RuntimeException.class,()->service.read(2L,id));assertEquals(0,calls.get());
        service.read(1L,id);service.read(1L,id);
        assertEquals(1,calls.get());verify(payments,times(1)).reconcile(1L,id,Map.of());verify(payments,times(2)).read(1L,id);
    }
    @Test void networkFailureDoesNotGrantOrWriteAndAReadStillWorks() {
        when(repository.find(id)).thenReturn(Optional.of(row("PENDING",now.minusSeconds(60))));
        var service=new PaymentReconciliationService(repository,gateway,payments,body -> {throw new IllegalStateException();},Clock.fixed(now,ZoneOffset.UTC));
        service.read(1L,id);verify(payments,never()).reconcile(anyLong(),any(),any());verify(payments).read(1L,id);
    }
    @Test void completedTooNewAndDisabledOrdersNeverQuery() {
        var service=new PaymentReconciliationService(repository,gateway,payments,body -> {fail("Unexpected query");return Map.of();},Clock.fixed(now,ZoneOffset.UTC));
        for(var row:List.of(row("SUCCEEDED",now.minusSeconds(60)),row("FAILED",now.minusSeconds(60)),
                row("PENDING",now))) {
            when(repository.find(id)).thenReturn(Optional.of(row));service.read(1L,id);
        }
        var disabled=new PaymentReconciliationService(repository,new VnPayGateway(false,"","",""),payments,
            body -> {fail("Disabled gateway");return Map.of();},Clock.fixed(now,ZoneOffset.UTC));
        when(repository.find(id)).thenReturn(Optional.of(row("PENDING",now.minusSeconds(60))));disabled.read(1L,id);
        verify(payments,never()).reconcile(anyLong(),any(),any());
    }
}

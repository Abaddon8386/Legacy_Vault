package com.legacyvault.subscription.service;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.legacyvault.subscription.service.EffectivePlanResolver.*;

class EffectivePlanResolverTest {
    private static final PlanVersion BASIC = new PlanVersion("BASIC", 1);
    private static final PlanVersion STANDARD = new PlanVersion("STANDARD", 2);
    private static final PlanVersion EXTENDED = new PlanVersion("EXTENDED", 1);
    private static final Instant START = Instant.parse("2026-10-16T00:00:00Z");
    private static final Instant END = Instant.parse("2026-11-16T00:00:00Z");
    private final EffectivePlanResolver resolver = new EffectivePlanResolver(Clock.fixed(START, ZoneOffset.UTC));
    private final Grant grant = new Grant(STANDARD, START, END);

    @Test
    void usesInjectedClockAndPreservesCatalogVersion() {
        assertEquals(new Resolution(STANDARD, START), resolver.resolve(BASIC, List.of(grant)));
    }

    @Test
    void includesStartAndExcludesEndPrecisely() {
        assertEquals(BASIC, at(START.minusNanos(1)));
        assertEquals(STANDARD, at(START));
        assertEquals(STANDARD, at(END.minusNanos(1)));
        assertEquals(BASIC, at(END));
    }

    @Test
    void expiresWithoutSchedulerMaterializationOrAutomaticRenewal() {
        assertEquals(BASIC, at(END.plusSeconds(86400)));
        assertEquals(new Resolution(BASIC, START), resolver.resolve(BASIC, List.of()));
        assertEquals(STANDARD, at(START));
    }

    @Test
    void adjacentExplicitGrantAppliesAtBoundaryRegardlessOfInputOrder() {
        Grant next = new Grant(EXTENDED, END, END.plusSeconds(3600));
        List<Grant> grants = List.of(next, grant);
        assertEquals(EXTENDED, resolver.resolveAt(BASIC, grants, END).plan());
        assertEquals(BASIC, resolver.resolveAt(BASIC, grants, next.until()).plan());
        assertEquals(List.of(next, grant), grants);
    }

    @Test
    void gapBeforeFutureGrantFallsBackWithoutGrantingEarlyAccess() {
        Grant next = new Grant(EXTENDED, END.plusSeconds(60), END.plusSeconds(120));
        assertEquals(BASIC, resolver.resolveAt(BASIC, List.of(grant, next), END).plan());
        assertEquals(EXTENDED, resolver.resolveAt(BASIC, List.of(grant, next), next.from()).plan());
    }

    @Test
    void downgradeUsesOnlyItsExplicitlyGrantedPeriod() {
        Grant current = new Grant(EXTENDED, START, END);
        Grant downgrade = new Grant(STANDARD, END, END.plusSeconds(60));
        List<Grant> grants = List.of(current, downgrade);
        assertEquals(EXTENDED, resolver.resolveAt(BASIC, grants, END.minusNanos(1)).plan());
        assertEquals(STANDARD, resolver.resolveAt(BASIC, grants, END).plan());
        assertEquals(BASIC, resolver.resolveAt(BASIC, grants, downgrade.until()).plan());
    }

    @Test
    void rejectsOverlapsEvenOutsideEvaluationTimeInsteadOfChoosingPrecedence() {
        Grant overlap = new Grant(EXTENDED, END.minusNanos(1), END.plusSeconds(60));
        assertThrows(IllegalArgumentException.class,
                () -> resolver.resolveAt(BASIC, List.of(overlap, grant), START.minusSeconds(60)));
        assertThrows(IllegalArgumentException.class, () -> resolver.resolve(BASIC, List.of(grant, grant)));
    }

    @Test
    void rejectsInvalidPlanAndPeriodsIncludingUnspecifiedPaidExpiry() {
        assertThrows(IllegalArgumentException.class, () -> new PlanVersion(" ", 1));
        assertThrows(IllegalArgumentException.class, () -> new PlanVersion("BASIC", 0));
        assertThrows(IllegalArgumentException.class, () -> new Grant(STANDARD, END, START));
        assertThrows(IllegalArgumentException.class, () -> new Grant(STANDARD, START, START));
        assertThrows(NullPointerException.class, () -> new Grant(STANDARD, START, null));
    }

    private PlanVersion at(Instant instant) {
        return resolver.resolveAt(BASIC, List.of(grant), instant).plan();
    }
}

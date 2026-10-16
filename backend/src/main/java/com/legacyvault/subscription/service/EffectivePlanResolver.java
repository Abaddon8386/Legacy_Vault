package com.legacyvault.subscription.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * Proposed PS-77 interval semantics: [from, until). No persistence, scheduling or calendar policy.
 * Inputs must represent already-authorized, finite grants. Gaps resolve to the supplied fallback.
 */
public final class EffectivePlanResolver {
    public record PlanVersion(String code, int version) {
        public PlanVersion {
            if (code == null || code.isBlank() || version < 1)
                throw new IllegalArgumentException("Plan code and positive version are required");
        }
    }

    public record Grant(PlanVersion plan, Instant from, Instant until) {
        public Grant {
            Objects.requireNonNull(plan, "plan");
            Objects.requireNonNull(from, "from");
            Objects.requireNonNull(until, "until");
            if (!from.isBefore(until)) throw new IllegalArgumentException("Grant must have positive duration");
        }
    }

    public record Resolution(PlanVersion plan, Instant evaluatedAt) {}

    private final Clock clock;

    public EffectivePlanResolver(Clock clock) {
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Resolution resolve(PlanVersion fallback, List<Grant> grants) {
        return resolveAt(fallback, grants, clock.instant());
    }

    /** Reject ambiguous overlapping input rather than inventing upgrade/downgrade precedence. */
    public Resolution resolveAt(PlanVersion fallback, List<Grant> grants, Instant asOf) {
        Objects.requireNonNull(fallback, "fallback");
        Objects.requireNonNull(asOf, "asOf");
        List<Grant> ordered = List.copyOf(grants).stream().sorted(Comparator.comparing(Grant::from)).toList();
        for (int i = 1; i < ordered.size(); i++) {
            if (ordered.get(i).from().isBefore(ordered.get(i - 1).until()))
                throw new IllegalArgumentException("Overlapping grants require an approved conflict policy");
        }
        PlanVersion effective = fallback;
        for (Grant grant : ordered) {
            if (!asOf.isBefore(grant.from()) && asOf.isBefore(grant.until())) {
                effective = grant.plan();
                break;
            }
        }
        return new Resolution(effective, asOf);
    }
}

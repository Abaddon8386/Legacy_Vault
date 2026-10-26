package com.legacyvault.admin;

import java.time.Instant;
import java.util.Map;

/** Counts are sampled during [startedAt, completedAt], not a cross-table historical snapshot. */
public record AdminOverview(long totalAccounts, long activeVaults, long processingCases,
        Map<String,Long> roleAssignments, Instant startedAt, Instant completedAt, String consistency) {}

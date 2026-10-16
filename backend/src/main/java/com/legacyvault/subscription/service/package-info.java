/**
 * PS-77 experimental pure domain calculations, not wired into Spring, HTTP, persistence or writers.
 *
 * <p>Review assumptions before integration: grants use [from, until); each quota dimension permits
 * non-increasing usage while over its limit. These are proposed semantics, not approved API contracts.
 * Callers must supply authorized non-overlapping finite grants and the fallback plan; indefinite paid
 * grants and overlap precedence are intentionally unsupported pending policy decisions.
 *
 * <p>No calendar-month calculation, plan prices, MB/GB conversion, asset-type counting, payload-size
 * measurement, legal evidence allocation, backfill, authorization or database locking is implemented.
 * A quota decision does not grant permission to write or bypass ownership/legal guards. Future writers
 * must derive usage/delta from real data and evaluate under the same Owner lock as the atomic write.
 */
package com.legacyvault.subscription.service;

/**
 * PS-77 catalog, default BASIC entitlement, real Owner usage and transactional content quotas.
 *
 * <p>Approved measurement: binary byte units, all retained Assets including DOCUMENT, UTF-8 payload
 * content and every retained file version. Writers serialize on the existing Owner account before
 * taking resource locks and keep quota checks, data and audit in the same transaction. Each dimension
 * permits non-increasing usage while over quota; this never grants authorization or bypasses legal guards.
 *
 * <p>The latest approved model is lifetime plans selected after registration, with limit upgrades allowed,
 * without renewal, expiry or downgrade. Owner self-upgrades use the server catalog and immutable capacity snapshots. Legal evidence has
 * separate per-case byte/version limits. No calendar scheduler or finite-period resolver remains.
 */
package com.legacyvault.subscription.service;

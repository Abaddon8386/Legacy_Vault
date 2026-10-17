/**
 * PS-77 catalog, default BASIC entitlement, real Owner usage and transactional content quotas.
 *
 * <p>Approved measurement: binary byte units, all retained Assets including DOCUMENT, UTF-8 payload
 * content and every retained file version. Writers serialize on the existing Owner account before
 * taking resource locks and keep quota checks, data and audit in the same transaction. Each dimension
 * permits non-increasing usage while over quota; this never grants authorization or bypasses legal guards.
 *
 * <p>Paid grant authority, periods and legal evidence allocation remain unresolved. No paid assignment,
 * grant endpoint, automatic renewal or calendar scheduler is enabled. EffectivePlanResolver remains
 * a standalone proposed finite-interval calculation; it is not a source of paid production entitlement.
 */
package com.legacyvault.subscription.service;

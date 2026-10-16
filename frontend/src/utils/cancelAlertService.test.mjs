import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelAlertMessages,
  checkCancelAlertCapability,
  executeCancelAlert,
  getCancelAlertMessage,
  isValidCancelAlertResponse,
} from './cancelAlertService.js';

// ============================================================================
// 1. [SERVICE UNIT TEST] CAPABILITY, OWNERSHIP & PRODUCTION GUARDS
// ============================================================================

test('[SERVICE UNIT TEST] PS-24 Capability - Non-owner is strictly forbidden even if canCancel=true or customCapability=true', () => {
  // Regression: isOwner = false must unconditionally override all other flags
  assert.equal(
    checkCancelAlertCapability({
      status: 'TRIGGERED',
      isOwner: false,
      customCapability: true,
      canCancel: true,
      isTest: true,
    }),
    false,
    'Non-owner must be false even when canCancel or customCapability is true'
  );

  assert.equal(
    checkCancelAlertCapability({
      status: 'TRIGGERED',
      isOwner: false,
      canCancel: true,
      isDevPreview: true,
    }),
    false,
    'Non-owner must be false even in DEV Preview'
  );
});

test('[SERVICE UNIT TEST] PS-24 Capability - Production mode strictly forbids automatic status fallback', () => {
  // In production (testEnv.PROD = true), fallback status checking is forbidden
  const allowedInProd = checkCancelAlertCapability({
    status: 'TRIGGERED',
    isOwner: true,
    testEnv: { PROD: true },
  });
  assert.equal(
    allowedInProd,
    false,
    'Automatic status fallback must never activate in production without explicit BE capability'
  );

  // In normal clean mode without dev preview or test flags, fallback is also disabled
  const allowedInCleanMode = checkCancelAlertCapability({
    status: 'TRIGGERED',
    isOwner: true,
    isDevPreview: false,
    isTest: false,
  });
  assert.equal(
    allowedInCleanMode,
    false,
    'Fallback status must not trigger in normal clean mode'
  );
});

test('[SERVICE UNIT TEST] PS-24 Capability - Explicit BE capability is respected when isOwner is true', () => {
  assert.equal(
    checkCancelAlertCapability({
      status: 'MONITORING',
      customCapability: true,
      isOwner: true,
      isTest: true,
    }),
    true
  );

  assert.equal(
    checkCancelAlertCapability({
      status: 'TRIGGERED',
      customCapability: false,
      isOwner: true,
      isTest: true,
    }),
    false
  );

  const customEvaluator = ({ status, isOwner }) => isOwner && status === 'INTAKE_PENDING';
  assert.equal(
    checkCancelAlertCapability({
      status: 'INTAKE_PENDING',
      customCapability: customEvaluator,
      isOwner: true,
      isTest: true,
    }),
    true
  );
});

test('[SERVICE UNIT TEST] PS-24 Capability - Fallback is permitted exclusively in DEV Preview or Test Runner', () => {
  assert.equal(
    checkCancelAlertCapability({
      status: 'TRIGGERED',
      isOwner: true,
      isDevPreview: true,
    }),
    true
  );

  assert.equal(
    checkCancelAlertCapability({
      status: 'GRACE_PERIOD_EXCEEDED',
      isOwner: true,
      isTest: true,
    }),
    true
  );

  assert.equal(
    checkCancelAlertCapability({
      status: 'MONITORING',
      isOwner: true,
      isTest: true,
    }),
    false
  );
});

// ============================================================================
// 2. [SERVICE UNIT TEST] RESPONSE VALIDATION & ERROR LOCALIZATION
// ============================================================================

test('[SERVICE UNIT TEST] PS-24 Response Validation - Rejects {status:"FAILED", success:false}, undefined, null, and empty payloads', () => {
  // CRITICAL REGRESSION: Must NOT accept status: 'FAILED' or success: false
  assert.equal(isValidCancelAlertResponse({ status: 'FAILED', success: false }), false);
  assert.equal(isValidCancelAlertResponse({ status: 'FAILED' }), false);
  assert.equal(isValidCancelAlertResponse({ status: 'ERROR' }), false);
  assert.equal(isValidCancelAlertResponse({ success: false }), false);
  assert.equal(isValidCancelAlertResponse({ cancelled: false }), false);
  assert.equal(isValidCancelAlertResponse(undefined), false);
  assert.equal(isValidCancelAlertResponse(null), false);
  assert.equal(isValidCancelAlertResponse(''), false);
  assert.equal(isValidCancelAlertResponse(123), false);
  assert.equal(isValidCancelAlertResponse([]), false);
  assert.equal(isValidCancelAlertResponse({}), false);

  // Valid affirmative responses
  assert.equal(isValidCancelAlertResponse({ status: 'MONITORING' }), true);
  assert.equal(isValidCancelAlertResponse({ status: 'ACTIVE' }), true);
  assert.equal(isValidCancelAlertResponse({ success: true }), true);
  assert.equal(isValidCancelAlertResponse({ cancelled: true }), true);
  assert.equal(isValidCancelAlertResponse({ status: 'MONITORING', cancelledAlertAt: '2026-10-15T00:00:00Z' }), true);
});

test('[SERVICE UNIT TEST] PS-24 i18n & Error Mapping - Clean user-facing text without raw technical codes', () => {
  const viKeys = Object.keys(cancelAlertMessages.vi);
  const enKeys = Object.keys(cancelAlertMessages.en);

  assert.equal(viKeys.length, enKeys.length);
  for (const key of viKeys) {
    assert.ok(cancelAlertMessages.en[key]);
    assert.ok(cancelAlertMessages.vi[key]);
    assert.ok(!cancelAlertMessages.vi[key].includes('PS-24'));
    assert.ok(!cancelAlertMessages.vi[key].includes('PS-33'));
    assert.ok(!cancelAlertMessages.en[key].includes('PS-24'));
    assert.ok(!cancelAlertMessages.en[key].includes('PS-33'));
  }

  assert.equal(getCancelAlertMessage('UNAUTHENTICATED', 'vi'), cancelAlertMessages.vi.unauthorized);
  assert.equal(getCancelAlertMessage('ACCESS_DENIED', 'vi'), cancelAlertMessages.vi.forbidden);
  assert.equal(getCancelAlertMessage('INVALID_STATUS', 'vi'), cancelAlertMessages.vi.invalidStatus);
  assert.equal(getCancelAlertMessage('INVALID_RESPONSE', 'vi'), cancelAlertMessages.vi.invalidResponse);
  assert.equal(getCancelAlertMessage('NETWORK_ERROR', 'vi'), cancelAlertMessages.vi.networkError);
  assert.equal(getCancelAlertMessage('BACKEND_NOT_READY', 'vi'), cancelAlertMessages.vi.backendNotReady);
  assert.equal(getCancelAlertMessage('SUCCESS', 'vi'), cancelAlertMessages.vi.successNotice);
});

// ============================================================================
// 3. [SERVICE INTEGRATION TEST] EXECUTION, PRE-SUBMIT RE-CHECK & ROGUE ADAPTERS
// ============================================================================

test('[SERVICE INTEGRATION TEST] PS-24 Pre-submit Capability Check - Rejects if capability revoked prior to network call', async () => {
  let adapterCalled = false;
  const mockAdapter = async () => {
    adapterCalled = true;
    return { status: 'MONITORING' };
  };

  await assert.rejects(
    async () => {
      await executeCancelAlert({
        adapter: mockAdapter,
        isOwner: false,
        status: 'TRIGGERED',
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );

  assert.equal(adapterCalled, false, 'Adapter must never be executed when pre-submit check fails');
});

test('[SERVICE INTEGRATION TEST] PS-24 Response Validation - Rejects adapter returning {status:"FAILED", success:false} or undefined', async () => {
  const failedAdapter = async () => ({ status: 'FAILED', success: false });
  await assert.rejects(
    async () => {
      await executeCancelAlert({
        adapter: failedAdapter,
        isOwner: true,
        status: 'TRIGGERED',
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_RESPONSE');
      assert.equal(err.status, 500);
      return true;
    }
  );

  const undefinedAdapter = async () => undefined;
  await assert.rejects(
    async () => {
      await executeCancelAlert({
        adapter: undefinedAdapter,
        isOwner: true,
        status: 'TRIGGERED',
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_RESPONSE');
      return true;
    }
  );
});

test('[SERVICE INTEGRATION TEST] PS-24 Rogue Adapter Guard - Rejects rogue adapter that resolves despite signal.aborted', async () => {
  const controller = new AbortController();

  // Rogue adapter that ignores signal and resolves successfully
  const rogueAdapter = async () => {
    await new Promise((r) => setTimeout(r, 10));
    return { status: 'MONITORING' };
  };

  controller.abort(); // Aborted before or during call

  await assert.rejects(
    async () => {
      await executeCancelAlert({
        adapter: rogueAdapter,
        signal: controller.signal,
        isOwner: true,
        status: 'TRIGGERED',
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.name, 'AbortError');
      return true;
    }
  );
});

test('[SERVICE INTEGRATION TEST] PS-24 Execution - Missing adapter throws BACKEND_NOT_READY (no fake success)', async () => {
  await assert.rejects(
    async () => {
      await executeCancelAlert({
        isOwner: true,
        status: 'TRIGGERED',
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      assert.equal(err.status, 503);
      return true;
    }
  );
});

test('[SERVICE INTEGRATION TEST] PS-24 Execution - 401 Session Expired triggers onUnauthorized callback', async () => {
  let unauthorizedTriggered = false;
  const mock401Adapter = async () => {
    const err = new Error('Session expired');
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  };

  await assert.rejects(
    async () => {
      await executeCancelAlert({
        adapter: mock401Adapter,
        isOwner: true,
        status: 'TRIGGERED',
        isTest: true,
        onUnauthorized: () => {
          unauthorizedTriggered = true;
        },
      });
    },
    (err) => {
      assert.equal(err.status, 401);
      return true;
    }
  );

  assert.equal(unauthorizedTriggered, true);
});


test('Rejects contradictory receipts and asynchronous or throwing capability callbacks', () => {
  assert.equal(isValidCancelAlertResponse({status: 'FAILED', success: true}), false);
  assert.equal(isValidCancelAlertResponse({status: 'TRIGGERED', cancelled: true}), false);
  assert.equal(checkCancelAlertCapability({customCapability: async () => false}), false);
  assert.equal(checkCancelAlertCapability({customCapability: () => { throw new Error('failed'); }}), false);
});

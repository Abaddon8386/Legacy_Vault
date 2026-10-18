import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

import {
  isLegalApprovalSimulationPermitted,
  assessApprovalFreshness,
  validateApprovalForm,
  fetchDossierForApproval,
  submitLegalApproval,
  validateApprovalReceipt,
  LEGAL_APPROVAL_DECISIONS,
  SYNTHETIC_APPROVAL_DOSSIERS,
} from '../pages/legal/legalApprovalService.js';
import {
  getLegalApprovalTranslations,
  LEGAL_APPROVAL_TRANSLATIONS,
} from '../pages/legal/legalApprovalI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/legal/approval-review?preview=true',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponentModule(entry, production = false, metadataPatch = '') {
  const result = await build({
    configFile: false,
    plugins: [
      react(),
      {name: 'ps49-invalid-metadata', transform(code, id) {
        if (metadataPatch && id.replaceAll('\\', '/').endsWith('/legalApprovalService.js')) return code + '\n' + metadataPatch;
      }},
      ...(entry === 'src/App.jsx'
        ? [
            {
              name: 'ps49-test-auth-views',
              load(id) {
                if (id.replaceAll('\\', '/').endsWith('/pages/auth/LoginPage.jsx')) {
                  return `
                    import React from 'react';
                    export default function Login({onAuthenticated}) {
                      return React.createElement('button', {onClick: () => onAuthenticated({
                        accessToken: 'synthetic-route-token', tokenType: 'Bearer', expiresInSeconds: 3600,
                        user: globalThis.__PS49_AUTH_USER__
                      }, {lang: 'vi'})}, 'Test sign in');
                    }`;
                }
                if (id.replaceAll('\\', '/').endsWith('/pages/vault/VaultOverviewPage.jsx')) {
                  return `
                    import React from 'react';
                    export default function Vault() { return React.createElement('p', null, 'Owner dashboard marker'); }`;
                }
              },
            },
          ]
        : []),
    ],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const pageMod = await loadComponentModule('src/pages/legal/LegalApprovalReviewPage.jsx');
const LegalApprovalReviewPage = pageMod.default;

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    host,
    render: async (nextProps) => {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
    close: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function clickElement(el) {
  if (!el) return;
  el.click();
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function changeInput(element, value) {
  if (!element) return;
  const isSelect = element.tagName === 'SELECT';
  const isTextArea = element.tagName === 'TEXTAREA';
  const prototype = isSelect
    ? dom.window.HTMLSelectElement.prototype
    : isTextArea
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  if (element._valueTracker) {
    element._valueTracker.setValue(value === '' ? '__not_empty__' : '');
  }
  element.dispatchEvent(new dom.window.Event(isSelect ? 'change' : 'input', { bubbles: true }));
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

async function setRoute(path) {
  await act(async () => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
}

// ============================================================================
// 1. SERVICE & FRESHNESS EVALUATION TESTS (PS-49)
// ============================================================================

test('PS-49 Service: isLegalApprovalSimulationPermitted guards DEV vs PROD boundary', () => {
  // DEV preview permitted
  assert.equal(isLegalApprovalSimulationPermitted({ isDevPreview: true }), true);
  assert.equal(isLegalApprovalSimulationPermitted({ isTest: true }), true);

  // Live session token disables mock
  assert.equal(isLegalApprovalSimulationPermitted({ isDevPreview: true, accessToken: 'real-token' }), false);

  // Production build unconditionally forbids simulation
  assert.equal(
    isLegalApprovalSimulationPermitted({ isDevPreview: true, testEnv: { PROD: true } }),
    false
  );
  assert.equal(
    isLegalApprovalSimulationPermitted({ isTest: true, testEnv: { PROD: true } }),
    false
  );
});

test('PS-49 Service: assessApprovalFreshness enforces version, hash, scope, and dispute constraints', () => {
  // 1. Null dossier -> unavailable
  const nullResult = assessApprovalFreshness(null);
  assert.equal(nullResult.isFresh, false);
  assert.equal(nullResult.canApprove, false);
  assert.equal(nullResult.reasonCode, 'DOSSIER_NOT_FOUND');

  // 2. Missing metadata (no version or hash) -> incomplete, cannot approve
  const missingVer = assessApprovalFreshness({ documentVersion: null, documentHash: 'hash123' });
  assert.equal(missingVer.isFresh, false);
  assert.equal(missingVer.canApprove, false);
  assert.equal(missingVer.reasonCode, 'MISSING_VERSION_OR_HASH');

  const missingHash = assessApprovalFreshness({ documentVersion: 1, documentHash: null });
  assert.equal(missingHash.isFresh, false);
  assert.equal(missingHash.canApprove, false);
  assert.equal(missingHash.reasonCode, 'MISSING_VERSION_OR_HASH');

  // 3. Active legal dispute -> disputed, cannot approve
  const disputed = assessApprovalFreshness({
    documentVersion: 1,
    documentHash: 'hash123',
    hasActiveDispute: true,
    disputeDetails: 'In court',
    allocationScope: [{ id: '1' }],
  });
  assert.equal(disputed.status, 'DISPUTED');
  assert.equal(disputed.isFresh, false);
  assert.equal(disputed.canApprove, false);
  assert.equal(disputed.reasonCode, 'ACTIVE_LEGAL_DISPUTE');

  // 4. Missing allocation scope -> cannot approve
  const noScope = assessApprovalFreshness({
    documentVersion: 1,
    documentHash: 'hash123',
    hasActiveDispute: false,
    allocationScope: [],
  });
  assert.equal(noScope.status, 'MISSING_SCOPE');
  assert.equal(noScope.isFresh, false);
  assert.equal(noScope.canApprove, false);
  assert.equal(noScope.reasonCode, 'MISSING_ALLOCATION_SCOPE');

  // 5. Initial approval pending (no prior approval) -> can approve
  const initial = assessApprovalFreshness({
    documentVersion: 1,
    scopeFingerprint: 'scope-initial',
    documentHash: 'hash123',
    hasActiveDispute: false,
    allocationScope: [{ id: '1' }],
    previousApproval: null,
  });
  assert.equal(initial.status, 'PENDING_INITIAL_APPROVAL');
  assert.equal(initial.canApprove, true);

  // 6. Matched prior approval -> FRESH
  const fresh = assessApprovalFreshness({
    documentVersion: 2,
    documentHash: 'hash-abc',
    scopeFingerprint: 'scope-123',
    hasActiveDispute: false,
    allocationScope: [{ id: '1' }],
    previousApproval: {
      approvedVersion: 2,
      approvedHash: 'hash-abc',
      scopeFingerprint: 'scope-123',
      decision: 'APPROVE',
    },
  });
  assert.equal(fresh.status, 'FRESH');
  assert.equal(fresh.isFresh, true);
  assert.equal(fresh.canApprove, true);

  // 7. Mismatched version/hash/scope -> STALE
  const staleVer = assessApprovalFreshness({
    documentVersion: 3,
    documentHash: 'hash-abc',
    scopeFingerprint: 'scope-123',
    hasActiveDispute: false,
    allocationScope: [{ id: '1' }],
    previousApproval: {
      approvedVersion: 2,
      approvedHash: 'hash-abc',
      scopeFingerprint: 'scope-123',
      decision: 'APPROVE',
    },
  });
  assert.equal(staleVer.status, 'STALE');
  assert.equal(staleVer.isFresh, false);
  assert.equal(staleVer.canApprove, false);
  assert.equal(staleVer.mismatches.version, true);
  assert.equal(staleVer.mismatches.hash, false);

  const staleHash = assessApprovalFreshness({
    documentVersion: 2,
    documentHash: 'hash-xyz',
    scopeFingerprint: 'scope-123',
    hasActiveDispute: false,
    allocationScope: [{ id: '1' }],
    previousApproval: {
      approvedVersion: 2,
      approvedHash: 'hash-abc',
      scopeFingerprint: 'scope-123',
      decision: 'APPROVE',
    },
  });
  assert.equal(staleHash.status, 'STALE');
  assert.equal(staleHash.mismatches.hash, true);
});

test('PS-49 Service: validateApprovalForm validates decision & mandatory reason', () => {
  // Empty inputs -> invalid
  const empty = validateApprovalForm({}, 'vi');
  assert.equal(empty.isValid, false);
  assert.ok(empty.errors.decision);
  assert.ok(empty.errors.reason);

  // Invalid decision value -> invalid
  const invalidDec = validateApprovalForm({ decision: 'MAYBE', reason: 'Some justification' }, 'vi');
  assert.equal(invalidDec.isValid, false);
  assert.ok(invalidDec.errors.decision);

  // Whitespace-only reason -> invalid
  const wsReason = validateApprovalForm({ decision: 'APPROVE', reason: '   ' }, 'vi');
  assert.equal(wsReason.isValid, false);
  assert.ok(wsReason.errors.reason);

  // Valid APPROVE with reason
  const validApprove = validateApprovalForm({ decision: 'APPROVE', reason: 'Văn bản hợp lệ, con dấu rõ ràng.' }, 'vi');
  assert.equal(validApprove.isValid, true);
  assert.equal(Object.keys(validApprove.errors).length, 0);

  // Valid REJECT with reason
  const validReject = validateApprovalForm({ decision: 'REJECT', reason: 'Mã băm không khớp tệp gốc.' }, 'vi');
  assert.equal(validReject.isValid, true);
  assert.equal(Object.keys(validReject.errors).length, 0);

  // Bilingual error messages
  const viErrors = validateApprovalForm({}, 'vi').errors;
  const enErrors = validateApprovalForm({}, 'en').errors;
  assert.match(viErrors.decision, /chọn|quyết định/i);
  assert.match(enErrors.decision, /Please select/i);
  assert.match(viErrors.reason, /Lý do|không được để trống/i);
  assert.match(enErrors.reason, /justification is required/i);
});

test('PS-49 Service: fetchDossierForApproval returns mock in DEV and throws BACKEND_NOT_READY in Live', async () => {
  // Mock mode
  const res = await fetchDossierForApproval('dossier-001', { isDevPreview: true });
  assert.equal(res.isSimulation, true);
  assert.equal(res.dossier.id, 'dossier-001');
  assert.equal(Boolean(res.freshness), true);

  // Live mode throws BACKEND_NOT_READY
  await assert.rejects(
    async () => {
      await fetchDossierForApproval('dossier-001', { isDevPreview: false, accessToken: 'real-token' });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      assert.equal(err.status, 503);
      assert.equal(err.status, 503);
      return true;
    }
  );

  // Mock error scenario
  await assert.rejects(
    async () => {
      await fetchDossierForApproval('error', { isDevPreview: true });
    },
    (err) => {
      assert.equal(err.code, 'MOCK_NETWORK_ERROR');
      return true;
    }
  );

  // Mock not_found scenario
  await assert.rejects(
    async () => {
      await fetchDossierForApproval('not_found', { isDevPreview: true });
    },
    (err) => {
      assert.equal(err.code, 'DOSSIER_NOT_FOUND');
      return true;
    }
  );
});

test('PS-49 Service: submitLegalApproval and receipt validation enforce boundary and ISO UTC timestamp', async () => {
  // Live mode throws BACKEND_NOT_READY
  await assert.rejects(
    async () => {
      await submitLegalApproval('dossier-001', { decision: 'APPROVE', reason: 'Valid' }, { isDevPreview: false, accessToken: 'token' });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      assert.equal(err.status, 503);
      return true;
    }
  );

  // Mock submit returns valid receipt
  const receipt = await submitLegalApproval(
    'dossier-001',
    { decision: 'APPROVE', reason: 'Đủ điều kiện pháp lý' },
    {
      isDevPreview: true,
      currentVersion: 2,
      currentHash: 'hash-abc',
      scopeFingerprint: 'scope-xyz',
    }
  );
  assert.equal(receipt.isSimulation, true);
  assert.equal(receipt.decision, 'APPROVE');
  assert.equal(receipt.dossierId, 'dossier-001');
  assert.equal(receipt.verifierRole, 'LEGAL_VERIFIER');
  assert.equal(receipt.approvedVersion, 2);

  // Validate receipt validator
  const validated = validateApprovalReceipt(receipt, 'dossier-001', { isDevPreview: true, expectedDecision: 'APPROVE' });
  assert.equal(validated.id, receipt.id);
  assert.equal(validated.decision, 'APPROVE');

  // Receipt tampering detection
  assert.throws(() => {
    validateApprovalReceipt({ ...receipt, decision: 'HACKED' }, 'dossier-001', { isDevPreview: true });
  }, { code: 'INVALID_RECEIPT' });

  assert.throws(() => {
    validateApprovalReceipt({ ...receipt, dossierId: 'wrong-id' }, 'dossier-001', { isDevPreview: true });
  }, { code: 'INVALID_RECEIPT' });

  assert.throws(() => {
    validateApprovalReceipt({ ...receipt, recordedAt: 'invalid-time' }, 'dossier-001', { isDevPreview: true });
  }, { code: 'INVALID_RECEIPT' });
});

// ============================================================================
// 2. COMPONENT RENDERING & BEHAVIOR TESTS (PS-49)
// ============================================================================

test('PS-49 Component: Renders 5 review sections, boundary callout, and header with role badge', async () => {
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    // 1. Header with role badge
    assert.match(view.host.textContent, /Chuy\u00ean vi\u00ean th\u1ea9m \u0111\u1ecbnh ph\u00e1p l\u00fd/);
    assert.match(view.host.textContent, /Phê duyệt hồ sơ/);

    // 2. Legal authority boundary callout
    const boundary = view.host.querySelector('.lv-legal-approval-boundary');
    assert.equal(Boolean(boundary), true);
    assert.match(boundary.textContent, /thẩm quyền phê duyệt/);
    assert.match(boundary.textContent, /không tự động mở khóa kho di sản/);
    assert.match(boundary.textContent, /không thay thế lệnh giải mã/);

    // 3. Section 1: Dossier information
    assert.match(view.host.textContent, /Thông tin tham chiếu hồ sơ/);
    assert.match(view.host.textContent, /DOS-2026-0049/);
    assert.match(view.host.textContent, /Trần Đình Trọng/);

    // 4. Section 2: Integrity & SHA-256 hash
    assert.match(view.host.textContent, /Văn bản di chúc & Mã băm toàn vẹn/);
    assert.match(view.host.textContent, /e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855/);

    // 5. Section 3: Allocation scope table
    assert.match(view.host.textContent, /Phạm vi phân bổ tài sản/);
    const table = view.host.querySelector('.lv-legal-approval-table');
    assert.equal(Boolean(table), true);
    assert.match(table.textContent, /Căn hộ Penthouse Landmark 81/);
    assert.match(table.textContent, /Trần Minh Quang/);

    // 6. Section 4: Approval freshness
    assert.match(view.host.textContent, /Trạng thái hiệu lực phê duyệt/);

    // 7. Section 5: Determination form (NO radio selected initially!)
    assert.match(view.host.textContent, /Quyết định thẩm định/);
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    assert.equal(radios.length, 2);
    assert.equal(radios[0].checked, false);
    assert.equal(radios[1].checked, false);

    const reasonArea = view.host.querySelector('#legal-approval-reason');
    assert.equal(Boolean(reasonArea), true);
    assert.equal(reasonArea.value, '');
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Form validation displays errors and clears them on input', async () => {
  await setRoute('/legal/approval-review?preview=true');
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    const form = view.host.querySelector('form');
    assert.equal(Boolean(form), true);

    // Click submit without radio or reason
    await act(async () => {
      clickElement(view.host.querySelector('form button[type="submit"]'));
    });

    // Check validation errors are visible
    assert.match(view.host.textContent, /Vui lòng chọn quyết định Chấp thuận hoặc Từ chối/);
    assert.match(view.host.textContent, /Lý do quyết định là bắt buộc và không được để trống/);

    // Select APPROVE radio
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[0]);
    });
    assert.equal(radios[0].checked, true);
    // Decision error should now be cleared
    assert.equal(view.host.textContent.includes('Vui lòng chọn quyết định Chấp thuận hoặc Từ chối'), false);
    // Reason error remains
    assert.match(view.host.textContent, /Lý do quyết định là bắt buộc và không được để trống/);

    // Type reason
    const reasonArea = view.host.querySelector('#legal-approval-reason');
    await act(async () => {
      changeInput(reasonArea, 'Đã kiểm tra đối chiếu bản gốc có công chứng.');
    });
    assert.equal(view.host.textContent.includes('Lý do quyết định là bắt buộc và không được để trống'), false);
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Bilingual toggle preserves form inputs and translates errors and UI', async () => {
  await setRoute('/legal/approval-review?preview=true');
  let currentLang = 'vi';
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: currentLang,
    onToggleLang: (newLang) => {
      currentLang = newLang;
    },
  });

  try {
    // Select REJECT and enter reason in VI
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[1]); // REJECT
    });
    const reasonArea = view.host.querySelector('#legal-approval-reason');
    await act(async () => {
      changeInput(reasonArea, 'Bản sao không có dấu mộc.');
    });

    // Toggle to EN
    await view.render({
      isDevPreview: true,
      lang: 'en',
    });

    // Verify UI translated to English
    assert.match(view.host.textContent, /Legal Review Portal/);
    assert.match(view.host.textContent, /Estate Dossier Reference/);
    assert.match(view.host.textContent, /Reject Dossier/);

    // Verify inputs preserved
    const radiosEn = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    assert.equal(radiosEn[1].checked, true);
    const reasonAreaEn = view.host.querySelector('#legal-approval-reason');
    assert.equal(reasonAreaEn.value, 'Bản sao không có dấu mộc.');

    // Clear reason and trigger validation in EN
    await act(async () => {
      changeInput(reasonAreaEn, '');
    });
    await act(async () => {
      clickElement(view.host.querySelector('form button[type="submit"]'));
    });
    assert.match(view.host.textContent, /justification is required/);
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Confirmation modal opens, shows summary, confirms submission, and displays receipt', async () => {
  await setRoute('/legal/approval-review?preview=true');
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    // Select APPROVE and type reason
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[0]); // APPROVE
    });
    const reasonArea = view.host.querySelector('#legal-approval-reason');
    await act(async () => {
      changeInput(reasonArea, 'Hồ sơ đầy đủ, chữ ký người lập di chúc hợp lệ.');
    });

    // Submit form -> opens confirmation modal
    await act(async () => {
      clickElement(view.host.querySelector('form button[type="submit"]'));
    });

    // Modal is open
    const modal = view.host.querySelector('.lv-legal-approval-modal');
    assert.equal(Boolean(modal), true);
    assert.match(modal.textContent, /Xác nhận quyết định thẩm định/);
    assert.match(modal.textContent, /DOS-2026-0049/);
    assert.match(modal.textContent, /Version 2/);
    assert.match(modal.textContent, /Hồ sơ đầy đủ, chữ ký người lập di chúc hợp lệ/);
    assert.match(modal.textContent, /Thao tác này không tự động mở khóa kho di sản/);

    // Cancel modal works
    const cancelBtn = modal.querySelector('button.lv-btn--ghost');
    await act(async () => {
      clickElement(cancelBtn);
    });
    assert.equal(Boolean(view.host.querySelector('.lv-legal-approval-modal')), false);

    // Reopen modal and confirm
    await act(async () => {
      clickElement(view.host.querySelector('form button[type="submit"]'));
    });
    const confirmBtn = view.host.querySelector('.lv-legal-approval-modal button.lv-btn--primary');
    await act(async () => {
      clickElement(confirmBtn);
    });

    // Receipt card rendered
    const receiptCard = view.host.querySelector('.lv-legal-approval-receipt');
    assert.equal(Boolean(receiptCard), true);
    assert.match(receiptCard.textContent, /Biên nhận quyết định thẩm định/);
    assert.match(receiptCard.textContent, /LAPR-2026-/);
    assert.match(receiptCard.textContent, /Chấp thuận hồ sơ \(Phê duyệt\)/);
    assert.match(receiptCard.textContent, /v2/);
    assert.match(receiptCard.textContent, /Mô phỏng DEV/);

    // Form inputs reset after success
    const radiosAfter = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    assert.equal(radiosAfter[0].checked, false);
    assert.equal(radiosAfter[1].checked, false);
    assert.equal(view.host.querySelector('#legal-approval-reason').value, '');
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Scenario change resets inputs, errors, and receipt, and prevents race conditions (A -> B -> A)', async () => {
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    // Fill form on dossier-001
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[0]);
    });
    const reasonArea = view.host.querySelector('#legal-approval-reason');
    await act(async () => {
      changeInput(reasonArea, 'Ghi chú cho hồ sơ 001');
    });

    // Switch scenario to dossier-002 (stale scenario)
    const select = view.host.querySelector('.lv-legal-approval-scenario-select');
    assert.equal(Boolean(select), true);
    await act(async () => {
      select.value = 'dossier-002';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    // Verify scenario dossier-002 data loaded
    assert.match(view.host.textContent, /DOS-2026-0050/);
    assert.match(view.host.textContent, /CẢNH BÁO: Phê duyệt cũ đã hết hiệu lực/);

    // Verify inputs were reset
    const radios2 = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    assert.equal(radios2[0].checked, false);
    assert.equal(radios2[1].checked, false);
    assert.equal(view.host.querySelector('#legal-approval-reason').value, '');

    // Switch back to dossier-001 (A -> B -> A)
    await act(async () => {
      const selectBack = view.host.querySelector('.lv-legal-approval-scenario-select');
      selectBack.value = 'dossier-001';
      selectBack.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.match(view.host.textContent, /DOS-2026-0049/);
    assert.equal(view.host.querySelector('#legal-approval-reason').value, '');
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Disputed and Missing Scope scenarios disable submission and show warning banners', async () => {
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    const select = view.host.querySelector('.lv-legal-approval-scenario-select');

    // 1. Disputed scenario
    await act(async () => {
      select.value = 'dossier-003';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.match(view.host.textContent, /CẢNH BÁO: Hồ sơ đang có tranh chấp/);
    assert.match(view.host.textContent, /Không thể gửi quyết định phê duyệt khi hồ sơ đang trong tình trạng tranh chấp/);
    const submitBtnDisputed = view.host.querySelector('form button[type="submit"]');
    assert.equal(submitBtnDisputed.disabled, true);

    // 2. Missing scope scenario
    await act(async () => {
      const selectScope = view.host.querySelector('.lv-legal-approval-scenario-select');
      selectScope.value = 'dossier-004';
      selectScope.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.match(view.host.textContent, /Chưa có phạm vi phân bổ tài sản/);
    assert.match(view.host.textContent, /Không thể gửi quyết định phê duyệt khi hồ sơ chưa có phạm vi phân bổ/);
    const submitBtnScope = view.host.querySelector('form button[type="submit"]');
    assert.equal(submitBtnScope.disabled, true);
  } finally {
    await view.close();
  }
});

test('PS-49 Component: Error handling displays retry button on load failure and preserves form on submit failure', async () => {
  await setRoute('/legal/approval-review?preview=true');
  let failSubmit = true;
  const customSubmit = async (dossierId, data, opts) => {
    if (failSubmit) {
      const err = new Error('Lỗi kết nối máy chủ khi ghi nhận quyết định.');
      err.status = 500;
      throw err;
    }
    return submitLegalApproval(dossierId, data, opts);
  };

  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
    onSubmitApproval: customSubmit,
  });

  try {
    // Select APPROVE and type reason
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[0]);
    });
    const reasonArea = view.host.querySelector('#legal-approval-reason');
    await act(async () => {
      changeInput(reasonArea, 'Kiểm tra tính năng thử lại');
    });

    // Open modal and confirm
    await act(async () => {
      clickElement(view.host.querySelector('form button[type="submit"]'));
    });
    const confirmBtn = view.host.querySelector('.lv-legal-approval-modal button.lv-btn--primary');
    await act(async () => {
      clickElement(confirmBtn);
    });

    // Error banner shown, form preserved
    assert.match(view.host.textContent, /Lỗi kết nối máy chủ khi ghi nhận quyết định/);
    assert.equal(view.host.querySelector('#legal-approval-reason').value, 'Kiểm tra tính năng thử lại');

    // Now allow submit and click retry
    failSubmit = false;
    const retryBtn = view.host.querySelector('.lv-legal-approval-callout--disputed button');
    assert.equal(Boolean(retryBtn), true);
    await act(async () => {
      clickElement(retryBtn);
    });

    // Receipt card now shown
    assert.equal(Boolean(view.host.querySelector('.lv-legal-approval-receipt')), true);
  } finally {
    await view.close();
  }
});

test('PS-49 Component: HTTP 401 triggers onUnauthorized and HTTP 403 renders forbidden alert', async () => {
  let unauthorizedCalls = 0;
  const customLoad401 = async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  };

  const view401 = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
    loadDossier: customLoad401,
    onUnauthorized: () => {
      unauthorizedCalls++;
    },
  });
  try {
    assert.equal(unauthorizedCalls, 1);
  } finally {
    await view401.close();
  }

  // 403 test
  const customLoad403 = async () => {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  };
  const view403 = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
    loadDossier: customLoad403,
  });
  try {
    assert.match(view403.host.textContent, /Không có quyền truy cập/);
    assert.match(view403.host.textContent, /HTTP 403 Forbidden/);
  } finally {
    await view403.close();
  }
});

// ============================================================================
// 3. APP ROUTING & ROLE GUARD TESTS (PS-49)
// ============================================================================

test('PS-49 App Route: Anonymous redirect, LEGAL_VERIFIER access, Owner/Staff denial, and production preview block', async () => {
  const App = (await loadComponentModule('src/App.jsx')).default;
  const originalFetch = globalThis.fetch;

  try {
    // 1. Anonymous access to /legal/approval-review without preview redirects to Login
    await setRoute('/legal/approval-review');
    const anonView = await mount(App, {});
    try {
      assert.match(anonView.host.textContent, /Test sign in/);
      assert.equal(anonView.host.textContent.includes('Phê duyệt Pháp lý Hồ sơ Di sản'), false);
    } finally {
      await anonView.close();
    }

    // 2. Roles test
    for (const role of ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER']) {
      await setRoute('/legal/approval-review');
      globalThis.__PS49_AUTH_USER__ = {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Test Verifier',
        email: 'verifier@example.test',
        roles: [role],
      };
      globalThis.fetch = async (url) => {
        assert.match(String(url), /\/auth\/me$/);
        return new Response(JSON.stringify(globalThis.__PS49_AUTH_USER__), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const roleView = await mount(App, {});
      try {
        // Click sign in
        await act(async () => {
          roleView.host.querySelector('button').click();
        });

        // Navigate to /legal/approval-review
        await setRoute('/legal/approval-review');

        if (role === 'LEGAL_VERIFIER') {
          // Allowed
          assert.match(roleView.host.textContent, /Chuy\u00ean vi\u00ean th\u1ea9m \u0111\u1ecbnh ph\u00e1p l\u00fd/);
          assert.match(roleView.host.textContent, /Phê duyệt hồ sơ/);
        } else {
          // Denied 403
          assert.match(roleView.host.textContent, /Cổng này chỉ dành cho tài khoản Thẩm định Pháp lý/);
          assert.equal(roleView.host.textContent.includes('DOS-2026-0049'), false);
        }
      } finally {
        await roleView.close();
      }
    }

    // 3. DEV Preview renders without session
    await setRoute('/legal/approval-review?preview=true');
    const devPreviewView = await mount(App, {});
    try {
      assert.match(devPreviewView.host.textContent, /Chuy\u00ean vi\u00ean th\u1ea9m \u0111\u1ecbnh ph\u00e1p l\u00fd/);
      assert.match(devPreviewView.host.textContent, /Xem trước DEV/);
      assert.match(devPreviewView.host.textContent, /DOS-2026-0049/);
    } finally {
      await devPreviewView.close();
    }

    // 4. Production build blocks preview=true without login
    const ProdApp = (await loadComponentModule('src/App.jsx', true)).default;
    await setRoute('/legal/approval-review?preview=true');
    const prodView = await mount(ProdApp, {});
    try {
      assert.match(prodView.host.textContent, /Test sign in/);
      assert.equal(prodView.host.textContent.includes('DOS-2026-0049'), false);
    } finally {
      await prodView.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__PS49_AUTH_USER__;
  }
});

test('PS-49 Preview: Reset scenario restores original dossier state, clears decision form and receipt, and resets state badges', async () => {
  const view = await mount(LegalApprovalReviewPage, {
    isDevPreview: true,
    lang: 'vi',
  });
  try {
    const radios = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    await act(async () => {
      clickElement(radios[0]);
      changeInput(view.host.querySelector('#legal-approval-reason'), 'Thử nghiệm nút đặt lại kịch bản');
    });
    assert.equal(view.host.querySelector('#legal-approval-reason').value, 'Thử nghiệm nút đặt lại kịch bản');

    const resetBtn = view.host.querySelector('.lv-legal-approval-reset-btn');
    assert.equal(Boolean(resetBtn), true);
    await act(async () => {
      clickElement(resetBtn);
    });

    assert.equal(view.host.querySelector('#legal-approval-reason').value, '');
    const radiosAfter = view.host.querySelectorAll('input[type="radio"][name="legalApprovalDecision"]');
    assert.equal(radiosAfter[0].checked, false);
    assert.equal(radiosAfter[1].checked, false);
    assert.match(view.host.textContent, /Khởi đầu:/);
    assert.match(view.host.textContent, /Hiện tại:/);
  } finally {
    await view.close();
  }
});

test('PS-49 rejects invalid metadata even when both approval bindings are identical', () => {
 const base={documentVersion:2,documentHash:'hash-ok',scopeFingerprint:'scope-ok',allocationScope:[{id:'a'}],previousApproval:{approvedVersion:2,approvedHash:'hash-ok',scopeFingerprint:'scope-ok',decision:'APPROVE'}};
 for(const value of [' ', '', '2', -1, 0, 1.5, Infinity, NaN, true, null, undefined, Number.MAX_SAFE_INTEGER+1]) {
  const result=assessApprovalFreshness({...base,documentVersion:value,previousApproval:{...base.previousApproval,approvedVersion:value}});
  assert.equal(result.isFresh,false);assert.equal(result.canApprove,false);
 }
 for(const field of ['documentHash','scopeFingerprint']) for(const value of [undefined,null,'',' ',false,{}]) {
  const prior=field==='documentHash'?'approvedHash':'scopeFingerprint';
  const result=assessApprovalFreshness({...base,[field]:value,previousApproval:{...base.previousApproval,[prior]:value}});
  assert.equal(result.isFresh,false);assert.equal(result.canApprove,false);
 }
 for(const patch of [{approvedVersion:-1},{approvedHash:' '},{scopeFingerprint:undefined}]) assert.equal(assessApprovalFreshness({...base,previousApproval:{...base.previousApproval,...patch}}).canApprove,false);
 assert.equal(assessApprovalFreshness(base).isFresh,true);
 assert.equal(assessApprovalFreshness({...base,previousApproval:null}).canApprove,true);
 assert.equal(assessApprovalFreshness({...base,scopeFingerprint:undefined,previousApproval:null}).canApprove,false);
});

test('PS-49 UI blocks invalid version and missing scope binding without a ready notice', async()=>{
 for (const patch of ["SYNTHETIC_APPROVAL_DOSSIERS['dossier-001'].documentVersion = -1;", "delete SYNTHETIC_APPROVAL_DOSSIERS['dossier-001'].scopeFingerprint;"]) {
  const Component=(await loadComponentModule('src/pages/legal/LegalApprovalReviewPage.jsx',false,patch)).default;
  const view=await mount(Component,{isDevPreview:true,lang:'en'});
  try { assert.match(view.host.textContent,/Approval is blocked/);assert.doesNotMatch(view.host.textContent,/Dossier Ready for Legal Determination/);const review=view.host.querySelector('button[type=submit]');assert.ok(review);assert.equal(review.disabled,true); }
  finally {await view.close();}
 }
});

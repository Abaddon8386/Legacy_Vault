import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/approval-review' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const finalDecisionMod = await component('src/pages/legal/LegalFinalDecision.jsx');
const LegalFinalDecision = finalDecisionMod.default;

const workspaceMod = await component('src/pages/legal/LegalDistributionWorkspace.jsx');
const { LegalDistributionFinalWorkspace } = workspaceMod;

const caseId = '11111111-1111-4111-8111-111111111111';
const vaultId = '22222222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);
const allocationHash = 'b'.repeat(64);

const baseContext = {
  caseId,
  caseNumber: 'HS-2026-000001',
  vaultId,
  caseStatus: 'OPEN',
  vaultStatus: 'LEGAL_BASIS_VERIFICATION',
  capabilities: {
    approval: { allowed: false, blockedReason: 'LEGAL_DECISION_STALE' },
    unlock: { allowed: false, blockedReason: 'LEGAL_APPROVAL_REQUIRED' },
  },
  snapshot: {
    currentVersion: 1,
    requiredVersion: 1,
    sha256Hash: sha256,
    allocationHash,
    disputeStatus: 'NONE',
    reviewStatus: 'FRESH',
    reviewFresh: true,
    approvalCurrent: false,
    latestDecision: {
      id: '33333333-3333-4333-8333-333333333333',
      result: 'LEGAL_REJECTED',
      reason: 'Thiếu con dấu công chứng trang 3',
    },
    courtResult: 'VALID',
  },
  basisDossier: {
    id: 'dossier-1',
    caseId,
    route: 'COURT',
    status: 'FORWARDED',
    disputeStatus: 'NONE',
    requiredVersion: 1,
    versions: [
      {
        version: 1,
        forwardStatus: 'FORWARDED',
        sha256,
        contentType: 'application/pdf',
        sizeBytes: 1024,
      },
    ],
    currentDecision: {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'LEGAL_REJECTED',
      reason: 'Thiếu con dấu công chứng trang 3',
      documentVersion: 1,
      documentSha256: sha256,
      allocationSha256: allocationHash,
    },
  },
};

const session = {
  accessToken: 'test-legal-token',
  user: { id: 'user-legal-1', roles: ['LEGAL_VERIFIER'] },
};

async function mount(element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test('LegalFinalDecision renders rejection decision and reason on reload', async () => {
  const view = await mount(
    React.createElement(LegalFinalDecision, {
      session,
      context: baseContext,
      step: 'approval-review',
      lang: 'vi',
      draft: {},
      setDraft: () => {},
      onReload: () => {},
      onSaved: () => {},
      workflowReadOnly: true,
    })
  );

  try {
    assert.match(view.host.textContent, /Quyết định gần nhất/);
    assert.match(view.host.textContent, /Từ chối/);
    assert.match(view.host.textContent, /Lý do từ chối/);
    assert.match(view.host.textContent, /Thiếu con dấu công chứng trang 3/);
    assert.match(view.host.textContent, /Phiên bản hồ sơ này đã bị từ chối/);
  } finally {
    await view.close();
  }
});

test('LegalFinalDecision renders rejection in English as well', async () => {
  const view = await mount(
    React.createElement(LegalFinalDecision, {
      session,
      context: baseContext,
      step: 'approval-review',
      lang: 'en',
      draft: {},
      setDraft: () => {},
      onReload: () => {},
      onSaved: () => {},
      workflowReadOnly: true,
    })
  );

  try {
    assert.match(view.host.textContent, /Latest decision/);
    assert.match(view.host.textContent, /Rejected/);
    assert.match(view.host.textContent, /Rejection reason/);
    assert.match(view.host.textContent, /Thiếu con dấu công chứng trang 3/);
    assert.match(view.host.textContent, /This document version was rejected/);
  } finally {
    await view.close();
  }
});

test('LegalDistributionFinalWorkspace exposes Open Supplementation when phase is REJECTED', async () => {
  let executedAction = null;
  let executedPayload = null;

  const mockWorkflow = {
    data: {
      caseId,
      revision: 1,
      phase: 'REJECTED',
      prerequisites: { deathApproved: true, willMatched: true },
      request: { id: 'req-1', reason: 'Vui lòng nộp bản án' },
      capabilities: {
        requestDocumentSupplementation: { allowed: true, blockedReason: null },
      },
      document: { version: 1, sha256, status: 'CHANGES_REQUESTED' },
      allocation: { version: 1, documentVersion: 1, sha256: allocationHash, status: 'CHANGES_REQUESTED', items: [] },
    },
    pending: false,
    run: async (action, body) => {
      executedAction = action;
      executedPayload = body;
      return { id: 'receipt-1', success: true };
    },
  };

  let savedCalled = false;
  let reloadCalled = false;

  const view = await mount(
    React.createElement(LegalDistributionFinalWorkspace, {
      workflow: mockWorkflow,
      context: baseContext,
      session,
      step: 'approval-review',
      lang: 'vi',
      draft: {},
      setDraft: () => {},
      onSaved: () => { savedCalled = true; },
      onReload: () => { reloadCalled = true; },
    })
  );

  try {
    assert.match(view.host.textContent, /Mở bước bổ sung giấy tờ/);
    assert.match(view.host.textContent, /Hồ sơ đã bị từ chối/);

    const textarea = view.host.querySelector('textarea');
    assert.ok(textarea, 'Supplementation textarea must exist');

    const submitBtn = view.host.querySelector('button.lv-decision--warning');
    assert.ok(submitBtn, 'Submit button must exist');
    assert.equal(submitBtn.disabled, true, 'Submit button must be disabled when reason is empty');

    await act(async () => {
      // Input supplementation reason
      const inputEvent = { target: { value: 'Bổ sung trích lục công chứng trang 3' } };
      textarea[Object.keys(textarea).find(k => k.startsWith('__reactProps$'))].onChange(inputEvent);
    });

    assert.equal(submitBtn.disabled, false, 'Submit button must be enabled when reason is entered');

    await act(async () => {
      const form = textarea.closest('form');
      form[Object.keys(form).find(k => k.startsWith('__reactProps$'))].onSubmit({ preventDefault() {} });
    });

    assert.equal(executedAction, 'requestDocumentSupplementation');
    assert.deepEqual(executedPayload, { reason: 'Bổ sung trích lục công chứng trang 3' });
    assert.equal(savedCalled, true);
    assert.equal(reloadCalled, true);
  } finally {
    await view.close();
  }
});

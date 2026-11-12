import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import {
  distributionPhases,
  validateDistributionWorkflow,
  canUseDistributionAction,
} from '../workflows/distributionWorkflowService.js';
import { staffSessionPrerequisite } from './workflowFeedback.js';
import { staffGuidance } from './workflowGuidance.js';
import { distributionFixture } from './staffDistributionFixture.mjs';
import { mapCurrentBasisDecision } from '../pages/staff/staffLegalDocumentsService.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/legal-documents' });
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

const mod = await component('src/pages/staff/StaffLegalDocumentsPage.jsx');
const StaffLegalDocumentsPage = mod.default;

const caseId = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('PS-138: distributionPhases includes REJECTED and validateDistributionWorkflow accepts REJECTED without INVALID_RESPONSE', () => {
  assert.equal(distributionPhases.includes('REJECTED'), true);

  const rawWorkflow = distributionFixture(caseId, {
    phase: 'REJECTED',
    allowed: ['requestDocumentSupplementation'],
    document: { version: 1, sha256, status: 'CHANGES_REQUESTED' },
  });

  const validated = validateDistributionWorkflow(rawWorkflow, caseId);
  assert.equal(validated.phase, 'REJECTED');

  // Staff upload and allocation actions are strictly blocked while REJECTED
  assert.equal(canUseDistributionAction(validated, 'uploadDocuments', 'STAFF'), false);
  assert.equal(canUseDistributionAction(validated, 'forwardDocuments', 'STAFF'), false);
  assert.equal(canUseDistributionAction(validated, 'submitAllocations', 'STAFF'), false);

  // Legal may request supplementation when capability is allowed
  assert.equal(canUseDistributionAction(validated, 'requestDocumentSupplementation', 'LEGAL'), true);
});

test('PS-138: workflowFeedback and workflowGuidance provide clear messaging for REJECTED phase', () => {
  const item = { distributionWorkflow: { phase: 'REJECTED' } };
  const fbVi = staffSessionPrerequisite(item, 'vi');
  assert.match(fbVi.title, /Chờ Legal/);
  assert.match(fbVi.description, /từ chối phiên bản hồ sơ/);

  const fbEn = staffSessionPrerequisite(item, 'en');
  assert.match(fbEn.title, /Awaiting Legal/);
  assert.match(fbEn.description, /Legal rejected this document version/);

  const gVi = staffGuidance({ caseId, distributionWorkflow: { phase: 'REJECTED' }, lang: 'vi' });
  assert.match(gVi.message, /Hồ sơ đã bị Legal từ chối/);
  assert.equal(gVi.steps.find(s => s.id === 'intake')?.state, 'done');

  const gEn = staffGuidance({ caseId, distributionWorkflow: { phase: 'REJECTED' }, lang: 'en' });
  assert.match(gEn.message, /Case rejected by Legal/);
});

test('PS-138: mapCurrentBasisDecision maps BasisDossierResponse.currentDecision correctly', () => {
  assert.equal(mapCurrentBasisDecision(null, caseId), null);
  assert.equal(mapCurrentBasisDecision(undefined, caseId), null);
  assert.equal(mapCurrentBasisDecision({}, caseId), null);
  assert.equal(mapCurrentBasisDecision({ id: decisionId, status: 'LEGAL_REJECTED' }, caseId), null);

  const currentDecision = {
    id: decisionId,
    status: 'LEGAL_REJECTED',
    reason: 'Bản án thiếu dấu giáp lai trang 3',
    documentVersion: 2,
    documentSha256: sha256,
    allocationSha256: 'b'.repeat(64),
  };

  const mapped = mapCurrentBasisDecision(currentDecision, caseId);
  assert.equal(mapped.id, decisionId);
  assert.equal(mapped.caseId, caseId);
  assert.equal(mapped.documentVersion, 2);
  assert.equal(mapped.decision, 'LEGAL_REJECTED');
  assert.equal(mapped.reason, 'Bản án thiếu dấu giáp lai trang 3');
  assert.equal(mapped.documentSha256, sha256);
});

async function mountPage(props, dossierData) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const s = String(url);
    if (s.includes('/basis-dossier')) return jsonResponse(dossierData);
    if (s.includes('/distribution-workflow')) {
      return jsonResponse(distributionFixture(props.caseId || caseId, {
        phase: 'REJECTED',
        allowed: ['requestDocumentSupplementation'],
        document: { version: 1, sha256, status: 'CHANGES_REQUESTED' },
      }));
    }
    if (s.includes('/handover-sessions')) return jsonResponse([]);
    return jsonResponse({});
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(StaffLegalDocumentsPage, props));
  });
  await act(async () => {
    await new Promise(r => setTimeout(r, 60));
  });

  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
      globalThis.fetch = originalFetch;
    },
  };
}

const dossierWithRejection = {
  id: 'dossier-1',
  caseId,
  route: 'COURT',
  status: 'FORWARDED',
  disputeStatus: 'NONE',
  requiredVersion: 1,
  versions: [
    {
      version: 1,
      legalBasisType: 'COURT_JUDGMENT',
      issuingAuthority: 'Tòa án Nhân dân TP.HCM',
      documentNumber: '45/2026/QĐ-ST',
      issueDate: '2026-10-10',
      sha256,
      forwardStatus: 'FORWARDED',
    },
  ],
  currentDecision: {
    id: decisionId,
    status: 'LEGAL_REJECTED',
    reason: 'Thiếu con dấu công chứng trên trang cuối của quyết định phân chia',
    documentVersion: 1,
    documentSha256: sha256,
    allocationSha256: 'c'.repeat(64),
  },
};

test('PS-138: StaffLegalDocumentsPage renders StaffLegalDecisionNotice from dossier.currentDecision', async () => {
  const v = await mountPage({
    caseId,
    accessToken: 'staff-token',
    caseItem: { caseId, status: 'OPEN', caseNumber: 'HS-2026-000001' },
    lang: 'vi',
  }, dossierWithRejection);

  try {
    assert.match(v.host.textContent, /Legal đã từ chối phiên bản hồ sơ này/);
    assert.match(v.host.textContent, /Thiếu con dấu công chứng trên trang cuối/);
    assert.match(v.host.textContent, /chỉ gửi thay đổi sau khi Legal yêu cầu bổ sung giấy tờ/);

    const historyBtn = v.host.querySelector('.lv-distribution-context button');
    assert.ok(historyBtn, 'History button must be rendered');
    await act(async () => {
      historyBtn.click();
    });
    assert.match(v.host.textContent, /Lịch sử các phiên bản/);
  } finally {
    await v.close();
  }
});

test('PS-138: StaffLegalDecisionNotice is not rendered when version, case, or decision status does not match', async () => {
  // Case 1: Newer version (version 2) while decision was for version 1
  const vVersionMismatch = await mountPage({
    caseId,
    accessToken: 'staff-token',
    caseItem: { caseId, status: 'OPEN', caseNumber: 'HS-2026-000001' },
    lang: 'vi',
  }, {
    ...dossierWithRejection,
    versions: [{ ...dossierWithRejection.versions[0], version: 2 }],
  });
  try {
    assert.doesNotMatch(vVersionMismatch.host.textContent, /Legal đã từ chối phiên bản hồ sơ này/);
  } finally {
    await vVersionMismatch.close();
  }

  // Case 2: Decision is for a different case
  const vCaseMismatch = await mountPage({
    caseId: 'other-case-id',
    accessToken: 'staff-token',
    caseItem: { caseId: 'other-case-id', status: 'OPEN', caseNumber: 'HS-2026-000002' },
    lang: 'vi',
  }, dossierWithRejection);
  try {
    assert.doesNotMatch(vCaseMismatch.host.textContent, /Legal đã từ chối phiên bản hồ sơ này/);
  } finally {
    await vCaseMismatch.close();
  }

  // Case 3: Decision status is LEGAL_APPROVED
  const vApproved = await mountPage({
    caseId,
    accessToken: 'staff-token',
    caseItem: { caseId, status: 'OPEN', caseNumber: 'HS-2026-000001' },
    lang: 'vi',
  }, {
    ...dossierWithRejection,
    currentDecision: { ...dossierWithRejection.currentDecision, status: 'LEGAL_APPROVED' },
  });
  try {
    assert.doesNotMatch(vApproved.host.textContent, /Legal đã từ chối phiên bản hồ sơ này/);
  } finally {
    await vApproved.close();
  }

  // Case 4: currentDecision is null
  const vNullDecision = await mountPage({
    caseId,
    accessToken: 'staff-token',
    caseItem: { caseId, status: 'OPEN', caseNumber: 'HS-2026-000001' },
    lang: 'vi',
  }, {
    ...dossierWithRejection,
    currentDecision: null,
  });
  try {
    assert.doesNotMatch(vNullDecision.host.textContent, /Legal đã từ chối phiên bản hồ sơ này/);
  } finally {
    await vNullDecision.close();
  }
});

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from '../src/components/layout/AppShell.jsx';
import LegalLiveWorkflow from '../src/pages/legal/LegalLiveWorkflow.jsx';
import '../src/index.css';
import './legal-workflow.css';

// Explicit DEV-only HTTP fixtures. This entry is never imported by the application.
if (!import.meta.env.DEV) throw new Error('Development review only');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const [caseId, vaultId, recipientC] = ids;
const user = { id: caseId, fullName: 'Nguyễn Minh Anh · DEMO', roles: ['LEGAL_VERIFIER'] };
const session = { accessToken: 'synthetic-legal-review-only', expiresAt: Date.now() + 3600000, user };
const now = '2026-10-25T10:00:00Z';
function pdf(version) {
  const content = `BT /F1 18 Tf 48 740 Td (SYNTHETIC COURT DOCUMENT - VERSION ${version}) Tj 0 -36 Td /F1 12 Tf (A receives the family archive. C receives the cloud account.) Tj 0 -24 Td (For UI verification only. No real legal evidence.) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(output);
}
const files = [pdf(1), pdf(2)];
const hashes = await Promise.all(files.map(async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')));
const allocationHash = 'b'.repeat(64);
function makeContext(scenario) {
  const blocked = scenario === 'hold' ? 'LEGAL_WORKFLOW_ON_HOLD' : scenario === 'stale' ? 'LEGAL_DECISION_STALE' : scenario === 'cancelled' ? 'BASIS_DOSSIER_INVALID_STATE' : null;
  const vaultStatus = scenario === 'hold' ? 'ON_HOLD' : 'LEGAL_BASIS_VERIFICATION';
  const rows = [
    { assetId: caseId, beneficiaryId: caseId, description: 'Toàn bộ nội dung kho ảnh gia đình theo mục 2.1 của văn bản.', assetName: 'Kho ảnh và kỷ niệm gia đình', assetType: 'TEXT', recipientName: 'Nguyễn Văn A', recipientSource: 'OWNER_DESIGNATED', sourceVersionNo: null, accountLinked: true },
    { assetId: vaultId, beneficiaryId: recipientC, description: 'Tài khoản lưu trữ đám mây theo mục 2.2 của văn bản.', assetName: 'Tài khoản lưu trữ đám mây', assetType: 'CREDENTIAL', recipientName: 'Trần Thị C', recipientSource: 'COURT_DOCUMENT', sourceVersionNo: 2, accountLinked: false },
  ];
  const versions = [1, 2].map(version => ({ version, sha256: hashes[version - 1], contentType: 'application/pdf', sizeBytes: files[version - 1].length, forwardStatus: 'FORWARDED', documentNumber: `${version === 1 ? '12' : '25'}/2026/DS-ST`, forwardedAt: now,
    allocations: version === 2 ? rows : [{ ...rows[0], recipientName: 'Người nhận B — bản cũ', description: 'Phân bổ cũ để tra cứu' }] }));
  return { caseId, caseNumber: 'HS-2026-000042', vaultId, caseStatus: scenario === 'cancelled' ? 'CANCELLED' : 'OPEN', vaultStatus,
    deathDocuments: [], willComparison: { caseId, vaultStatus, approvalBlocked: false, originalWillIntakes: [], wills: [], comparisons: [] },
    basisDossier: { id: caseId, caseId, route: scenario === 'hold' ? 'ON_HOLD' : 'COURT', status: 'LEGAL_BASIS_FORWARDED', disputeStatus: 'NONE', requiredVersion: 2, versions },
    snapshot: { dossierId: caseId, currentVersion: 2, requiredVersion: 2, sha256Hash: hashes[1], allocationHash, disputeStatus: 'NONE', reviewStatus: 'FRESH', reviewFresh: scenario !== 'stale', approvalCurrent: false, latestDecision: null, courtResult: 'VALID' },
    capabilities: { approval: { allowed: !blocked, blockedReason: blocked }, unlock: { allowed: false, blockedReason: blocked || 'LEGAL_APPROVAL_REQUIRED' } }, evaluatedAt: now };
}
let context = makeContext('ready');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!String(url).startsWith('/api/v1/legal-verifications/')) return json({ code: 'REVIEW_ONLY' }, 404);
  if (init.method === 'POST') {
    if (String(url).endsWith('/decision')) {
      const body = JSON.parse(init.body); context.snapshot.approvalCurrent = body.decision === 'APPROVE';
      context.capabilities.unlock = { allowed: context.snapshot.approvalCurrent, blockedReason: context.snapshot.approvalCurrent ? null : 'LEGAL_APPROVAL_REQUIRED' };
      return json({ dossierId: caseId, decision: body.decision === 'APPROVE' ? 'LEGAL_APPROVED' : 'LEGAL_REJECTED', versionNo: 2, sha256Hash: hashes[1], allocationHash, decidedBy: caseId, decidedAt: now });
    }
    if (String(url).endsWith('/unlock') && context.capabilities.unlock.allowed) {
      context.vaultStatus = context.willComparison.vaultStatus = 'UNLOCKED';
      context.capabilities = { approval: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' }, unlock: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' } };
      return json({ caseId, vaultId, status: 'UNLOCKED', unlockedBy: caseId, unlockedAt: now });
    }
    return json({ code: 'REVIEW_WRITE_UNAVAILABLE' }, 409);
  }
  if (String(url).includes('verification-cases?')) return json({ content: [{ caseId, vaultId, caseNumber: context.caseNumber, caseStatus: context.caseStatus, vaultStatus: context.vaultStatus, route: context.basisDossier.route, openedAt: now }], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  if (String(url).endsWith('/context')) return json(context);
  if (String(url).endsWith('/basis-dossier')) return json(context.basisDossier);
  if (String(url).endsWith('/will-comparisons')) return json(context.willComparison);
  if (String(url).endsWith('/court-decisions')) return json([]);
  const version = String(url).match(/\/versions\/(1|2)\/content$/)?.[1];
  if (version) return new Response(files[Number(version) - 1], { headers: { 'Content-Type': 'application/pdf' } });
  return json({ code: 'REVIEW_ENDPOINT_UNAVAILABLE' }, 404);
};
export default function Review() {
  const [lang, setLang] = useState('vi'), [step, setStep] = useState('approval-review'), [scenario, setScenario] = useState('ready'), [revision, setRevision] = useState(0);
  return <AppShell role="LEGAL" session={session} user={user} isAuthenticated lang={lang} onToggleLang={setLang} currentTab={step} onNavigateTab={setStep} onRefresh={() => { context = makeContext(scenario); setRevision(value => value + 1); }}>
    <aside className="lv-legal-review-toolbar"><strong>DEV · Dữ liệu mô phỏng / Synthetic data</strong>
      <label>Tình huống<select value={scenario} onChange={event => { context = makeContext(event.target.value); setScenario(event.target.value); }}><option value="ready">A/C · C chưa linked</option><option value="hold">HOLD</option><option value="stale">STALE</option><option value="cancelled">CANCELLED</option></select></label>
    </aside>
    <LegalLiveWorkflow key={`${scenario}:${step}:${revision}`} session={session} lang={lang} step={step} caseId={caseId} onNavigate={url => setStep(new URL(url, location.origin).pathname.split('/').pop())} />
  </AppShell>;
}
createRoot(document.getElementById('root')).render(<Review />);

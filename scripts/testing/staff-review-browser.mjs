// Explicit, loopback-only contract fixture. No database, mail, real users or production fallback.
// Run from repo root: node scripts/testing/staff-review-browser.mjs
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { ids } from '../../frontend/src/utils/staffReviewFixture.mjs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
import { isPublicUuid } from '../../frontend/src/utils/deliveryReceiptValidation.js';

const { caseId, sessionId, recipient, assetId } = ids;
const recipient2 = '77777777-7777-4777-8777-777777777777';
const assetId2 = '88888888-8888-4888-8888-888888888888';
const assetId3 = '99999999-9999-4999-8999-999999999999';

// Quản lý trạng thái bàn giao theo cặp (assetId, recipientId)
const deliveryState = new Map([
  [`${assetId}:${recipient}`, false],
  [`${assetId2}:${recipient}`, false],
  [`${assetId3}:${recipient2}`, false],
]);
const deliveryItems = new Map();

let confirmed = false, completed = false, archived = false;
const receipts = [];
const user = {
  id: ids.otherCaseId,
  email: 'fixture.staff@example.test',
  fullName: 'Thái Staff — Dữ liệu minh họa COURT',
  roles: ['STAFF_EXECUTOR'],
};

// DTO chuẩn BasisDossierResponse & BasisVersionResponse
let basisDossier = {
  id: 'dossier-002',
  caseId,
  route: 'COURT',
  status: 'LEGAL_BASIS_PROVIDED',
  disputeStatus: 'DISPUTED',
  routeReason: null,
  classifiedBy: '00000000-0000-0000-0000-000000000002',
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
  requiredVersion: 1,
  versions: [
    {
      version: 1,
      legalBasisType: 'COURT_JUDGMENT',
      issuingAuthority: 'Tòa án Nhân dân TP. Hồ Chí Minh',
      documentNumber: '45/2026/DS-ST',
      issueDate: '2026-10-15',
      evidenceReference: 'HS-2026-TA-45',
      notes: 'Bản án giải quyết tranh chấp phân chia di sản theo phán quyết của Tòa án',
      contentType: 'application/pdf',
      sizeBytes: 2540000,
      sha256: '9f833777d97ff1b8d7d8e9e70a6ec495d8ed05d909fed451a604b807773ac242',
      forwardStatus: 'NOT_FORWARDED',
      createdBy: '00000000-0000-0000-0000-000000000003',
      createdAt: '2026-10-20T08:00:00Z',
      forwardedAt: null,
      current: true,
      allocations: [
        {
          id: 'alloc-001',
          assetId,
          beneficiaryId: recipient,
          description: 'Kho di sản số Vance',
        },
        {
          id: 'alloc-002',
          assetId: assetId2,
          beneficiaryId: recipient,
          description: 'Tài khoản đầu tư số Vance',
        },
        {
          id: 'alloc-003',
          assetId: assetId3,
          beneficiaryId: recipient2,
          description: 'Bản quyền tác phẩm số Vance',
        },
      ],
    },
  ],
};

const session = () => ({
  sessionId,
  caseId,
  vaultId: assetId,
  staffId: user.id,
  status: completed ? 'COMPLETED' : 'OPEN',
  openedAt: '2026-10-20T08:00:00Z',
  closedAt: completed ? '2026-10-20T09:00:00Z' : null,
});

const caseInfo = () => ({
  caseId,
  status: archived ? 'CLOSED' : 'OPEN',
  caseNumber: 'HS-2026-000001',
  vaultId: assetId,
  vaultName: 'Kho nghiệm thu minh họa',
  ownerId: recipient,
  ownerName: 'Chủ kho Vance',
  triggeredAt: '2026-10-20T08:00:00Z',
  closedAt: archived ? '2026-10-20T10:00:00Z' : null,
});

function staffFixturePlugin({ evidencePath } = {}) { return {
  name: 'explicit-staff-test-fixture',
  transformIndexHtml(html) {
    return html.replace(
      '<body>',
      '<body><aside style="position:relative;z-index:99;background:#fff8e6;color:#5a3e1b;padding:6px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #ffe1a6;display:flex;align-items:center;justify-content:center;gap:8px;"><span>⚖️ DỮ LIỆU MÔ PHỎNG HỒ SƠ TÒA ÁN (COURT) — CONTRACT FIXTURE (Không kết nối BE/SQL thật)</span></aside>'
    );
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      const path = req.url.split('?')[0];
      const post = req.method === 'POST';
      let text = '';
      for await (const part of req) text += part;

      let body = {};
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        // Parse metadata JSON part from multipart boundary
        const metadataMatch = text.match(/name="metadata"[^\r\n]*\r?\n\r?\n([\s\S]*?)\r?\n--/);
        if (metadataMatch) {
          try {
            body = JSON.parse(metadataMatch[1]);
          } catch {
            body = {};
          }
        }
      } else {
        try {
          body = JSON.parse(text || '{}');
        } catch {
          body = {};
        }
      }

      const send = (data, status = 200) => {
        if (evidencePath && (path.includes('/handover-sessions') || path.includes('/basis-dossier'))) {
          appendFileSync(evidencePath, JSON.stringify({
            at: new Date().toISOString(), method: req.method, path, status,
            ...(post && path.endsWith('/deliveries') ? { request: body } : {}), response: data,
          }) + '\n');
        }
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };

      if (path.endsWith('/auth/login')) {
        return send({
          accessToken: 'explicit-local-fixture-token',
          tokenType: 'Bearer',
          expiresInSeconds: 3600,
          user,
        });
      }
      if (path.endsWith('/auth/me')) return send(user);

      // Support anonymous preview or fixture token
      const isAuth = req.headers.authorization === 'Bearer explicit-local-fixture-token';
      const isPreview = req.url.includes('preview=true') || req.headers.referer?.includes('preview=true');
      if (!isAuth && !isPreview) return send({ code: 'UNAUTHENTICATED' }, 401);

      // Only synthetic IDs belonging to this preapproved fixture are accepted.
      if (path.includes('/verification-cases/') && !path.includes(caseId)) {
        return send({ code: 'RESOURCE_NOT_FOUND' }, 404);
      }
      const sessionMatch = path.match(/\/handover-sessions\/([^/]+)/);
      if (sessionMatch && sessionMatch[1] !== sessionId) {
        return send({ code: 'RESOURCE_NOT_FOUND' }, 404);
      }

      // Basis Dossier COURT endpoints (trả raw DTO BasisDossierResponse)
      if (path.endsWith('/basis-dossier')) {
        return send(basisDossier);
      }

      if (path.includes('/basis-dossier/versions') && path.endsWith('/forward')) {
        basisDossier = {
          ...basisDossier,
          status: 'LEGAL_BASIS_FORWARDED',
          updatedAt: new Date().toISOString(),
          versions: basisDossier.versions.map((v, i) =>
            i === 0 ? { ...v, forwardStatus: 'FORWARDED', forwardedAt: new Date().toISOString() } : v
          ),
        };
        return send(basisDossier);
      }

      if (path.endsWith('/basis-dossier/versions') && post) {
        // Finding B: BE rejects if allocations is empty
        const allocations = body.allocations;
        if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
          return send(
            { code: 'VALIDATION_FAILED', message: 'Allocations list cannot be empty per BE contract' },
            400
          );
        }
        const nextVersionNum = basisDossier.versions.length + 1;
        const newVersion = {
          version: nextVersionNum,
          legalBasisType: body.legalBasisType || 'COURT_JUDGMENT',
          documentNumber: body.documentNumber || '45-B/2026/DS-ST',
          issuingAuthority: body.issuingAuthority || 'Tòa án Nhân dân TP. Hồ Chí Minh',
          issueDate: body.issueDate || '2026-10-18',
          evidenceReference: body.evidenceReference || null,
          notes: body.notes || null,
          contentType: 'application/pdf',
          sizeBytes: 1540000,
          sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
          forwardStatus: 'NOT_FORWARDED',
          createdBy: user.id,
          createdAt: new Date().toISOString(),
          forwardedAt: null,
          current: true,
          allocations,
        };
        basisDossier = {
          ...basisDossier,
          status: 'LEGAL_BASIS_PROVIDED',
          updatedAt: new Date().toISOString(),
          versions: [newVersion, ...basisDossier.versions.map((v) => ({ ...v, current: false }))],
        };
        return send(basisDossier, 201);
      }

      // Danh sách tài sản đủ điều kiện bàn giao theo phiên (raw DTO EligibleHandoverAssetResponse)
      if (path.endsWith('/eligible-assets')) {
        if (completed) return send({ code: 'HANDOVER_SESSION_INVALID_STATE' }, 409);
        const urlObj = new URL(req.url, 'http://127.0.0.1:5198');
        const queryRecipientId = urlObj.searchParams.get('recipientId');

        const allEligible = [
          {
            assetId,
            recipientId: recipient,
            description: 'Kho di sản số Vance',
            deliveryStatus: deliveryState.get(`${assetId}:${recipient}`) ? 'DELIVERED' : 'ELIGIBLE',
          },
          {
            assetId: assetId2,
            recipientId: recipient,
            description: 'Tài khoản đầu tư số Vance',
            deliveryStatus: deliveryState.get(`${assetId2}:${recipient}`) ? 'DELIVERED' : 'ELIGIBLE',
          },
          {
            assetId: assetId3,
            recipientId: recipient2,
            description: 'Bản quyền tác phẩm số Vance',
            deliveryStatus: deliveryState.get(`${assetId3}:${recipient2}`) ? 'DELIVERED' : 'ELIGIBLE',
          },
        ];

        const filtered = queryRecipientId
          ? allEligible.filter((item) => item.recipientId === queryRecipientId)
          : allEligible;

        return send(filtered);
      }

      // Ghi nhận bàn giao (POST .../deliveries nhận HandoverDeliveryRequest: { recipientId, assetIds: [] })
      if (path.endsWith('/deliveries')) {
        if (post) {
          if (completed) return send({ code: 'HANDOVER_SESSION_INVALID_STATE', message: 'Session is already completed' }, 409);
          const { recipientId, assetIds } = body;
          if (!isPublicUuid(recipientId) || !Array.isArray(assetIds) || assetIds.length === 0
            || assetIds.length > 100 || !assetIds.every(isPublicUuid) || new Set(assetIds).size !== assetIds.length) {
            return send({ code: 'VALIDATION_FAILED', message: 'Missing recipientId or assetIds' }, 400);
          }

          // Kiểm tra xem recipientId có thuộc hồ sơ không
          if (recipientId !== recipient && recipientId !== recipient2) {
            return send({ code: 'HANDOVER_RECIPIENT_NOT_ELIGIBLE', message: 'Recipient is not allocated in approved legal basis' }, 409);
          }

          // Kiểm tra xem tất cả assetIds có thuộc về recipientId trong phân bổ không
          for (const aid of assetIds) {
            const key = `${aid}:${recipientId}`;
            if (!deliveryState.has(key)) {
              return send({ code: 'HANDOVER_ASSET_NOT_ELIGIBLE', message: `Asset ${aid} is not allocated to recipient ${recipientId}` }, 409);
            }
            if (deliveryState.get(key) === true) {
              return send({ code: 'HANDOVER_ASSET_ALREADY_DELIVERED', message: `Asset ${aid} has already been delivered to recipient ${recipientId}` }, 409);
            }
          }

          // Cập nhật trạng thái từng cặp (assetId, recipientId)
          for (const aid of assetIds) {
            const key = `${aid}:${recipientId}`;
            deliveryState.set(key, true);
          }

          const deliveredItems = assetIds.map((aid) => ({
            itemId: randomUUID(),
            sessionId,
            assetId: aid,
            recipientId,
            status: 'DELIVERED',
            staffId: user.id,
            deliveredAt: new Date().toISOString().slice(0, -1),
          }));
          for (const item of deliveredItems) deliveryItems.set(`${item.assetId}:${item.recipientId}`, item);
          res.setHeader('Location', path);
          return send(deliveredItems, 201);
        }

        const deliveredItems = [];
        for (const [key, isDelivered] of deliveryState.entries()) {
          if (isDelivered) {
            deliveredItems.push(deliveryItems.get(key));
          }
        }
        return send(deliveredItems);
      }

      if (path.endsWith('/beneficiary-confirmations')) {
        return send([
          {
            confirmationId: confirmed ? assetId : null,
            sessionId,
            beneficiaryId: recipient,
            status: confirmed ? 'CONFIRMED' : 'PENDING',
            confirmedAt: confirmed ? '2026-10-20T08:45:00Z' : null,
            receiptReference: confirmed ? 'BB-TEST-001' : null,
          },
        ]);
      }

      if (path.endsWith('/confirmation')) {
        const isAnyDelivered = Array.from(deliveryState.values()).some(Boolean);
        if (!isAnyDelivered || completed || !body.receiptReference) {
          return send({ code: 'HANDOVER_CONFIRMATION_PENDING_DELIVERY' }, 409);
        }
        confirmed = true;
        return send({
          sessionId,
          beneficiaryId: recipient,
          status: 'CONFIRMED',
          receiptReference: body.receiptReference,
          confirmedAt: '2026-10-20T08:45:00Z',
        });
      }

      if (path.endsWith('/completion-progress')) {
        const deliveredCount = Array.from(deliveryState.values()).filter(Boolean).length;
        const totalCount = deliveryState.size;
        return send({
          assets: { completed: deliveredCount, total: totalCount },
          beneficiaries: { completed: confirmed ? 1 : 0, total: 2 },
          ready: deliveredCount === totalCount && confirmed,
          reason: deliveredCount === totalCount && confirmed ? 'READY' : 'PENDING',
        });
      }

      if (path.endsWith('/close')) {
        const isAllDelivered = Array.from(deliveryState.values()).every(Boolean);
        if (!isAllDelivered || !confirmed) {
          return send({ code: 'HANDOVER_COMPLETION_PENDING' }, 409);
        }
        completed = true;
        return send({ sessionId, status: 'COMPLETED', closedAt: '2026-10-20T09:00:00Z' });
      }

      if (path.endsWith('/receipts')) {
        if (post) {
          if (!completed) return send({ code: 'HANDOVER_RECEIPT_SESSION_NOT_COMPLETED' }, 409);
          receipts.push({
            receiptId: ids.otherSessionId,
            sessionId,
            recipientId: recipient,
            assetIds: [assetId, assetId2, assetId3],
            confirmationType: 'STAFF_ATTESTATION',
            confirmedAt: '2026-10-20T09:10:00Z',
            supersedesReceiptId: null,
          });
          return send(receipts.at(-1), 201);
        }
        return send(receipts);
      }

      if (path.endsWith('/archive')) {
        if (!completed || !receipts.length) return send({ code: 'HANDOVER_COMPLETION_PENDING' }, 409);
        archived = true;
        return send({
          caseId,
          sessionId,
          vaultId: assetId,
          caseStatus: 'CLOSED',
          vaultStatus: 'ARCHIVED',
          archivedAt: '2026-10-20T10:00:00Z',
        });
      }

      if (path.endsWith('/handover-sessions')) return send([session()]);
      if (path.endsWith('/' + sessionId)) return send(session());
      if (path.endsWith('/' + caseId)) return send(caseInfo());
      if (path.endsWith('/staff/verification-cases')) {
        return send({ content: [caseInfo()], page: 0, size: 5, totalElements: 1, totalPages: 1 });
      }

      return send({ code: 'FIXTURE_ENDPOINT_NOT_IMPLEMENTED' }, 503);
    });
  },
}; }

export async function startStaffReviewServer({ port = 5198, evidencePath } = {}) {
const server = await createServer({
  root: new URL('../../frontend', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  configFile: false,
  plugins: [react(), staffFixturePlugin({ evidencePath })],
  server: { host: '127.0.0.1', port, strictPort: true },
});

await server.listen();
return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startStaffReviewServer();
  console.log('Explicit Staff contract fixture: http://127.0.0.1:5198 — no BE/SQL connection');
}

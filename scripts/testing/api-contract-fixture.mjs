// FE verification only. Not a backend implementation or evidence of DB integration.
// Bind loopback only; synthetic user/token; never persist or log request bodies.
import http from 'node:http';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { id, fullName: 'Contract Demo', email: 'demo@example.test', roles: ['VAULT_OWNER'] };
const token = 'SYNTHETIC-FE-CONTRACT-TOKEN';
let assets = [];
let vault = null;
let dms = null;
let scenario = 'normal';
let expiresInSeconds = 3600;
const now = () => new Date().toISOString();
const server = http.createServer(async (req, res) => {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'X-Trace-Id': 'synthetic-fixture-trace' });
    res.end(JSON.stringify(data));
  };
  const error = (status, code) => send(status, { status, code, messageKey: `fixture.${code}`,
    message: 'Synthetic contract error', traceId: 'synthetic-fixture-trace', errors: [] });
  try {
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 20000) return error(413, 'PAYLOAD_TOO_LARGE'); }
    const body = text ? JSON.parse(text) : {};
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (path === '/__fixture' && req.method === 'POST') {
      scenario = body.scenario || 'normal'; expiresInSeconds = body.expiresInSeconds || 3600;
      if (body.reset) { vault = null; dms = null; assets = []; }
      return send(200, { fixtureOnly: true });
    }
    if (path === '/api/v1/auth/register' && req.method === 'POST') {
      if (body.email === user.email) return error(409, 'EMAIL_ALREADY_EXISTS');
      return send(201, { ...user, fullName: body.fullName, email: body.email, status: 'ACTIVE', createdAt: now() });
    }
    if (path === '/api/v1/auth/login' && req.method === 'POST') {
      if (body.email !== user.email || body.password !== 'SyntheticPass123') return error(401, 'INVALID_CREDENTIALS');
      return send(200, { accessToken: token, tokenType: 'Bearer', expiresInSeconds, user });
    }
    if (req.headers.authorization !== `Bearer ${token}` || scenario === 'unauthenticated') return error(401, 'UNAUTHENTICATED');
    if (path === '/api/v1/auth/me') return send(200, user);
    if (scenario === 'forbidden') return error(403, 'ACCESS_DENIED');
    if (path === '/api/v1/vaults') {
      if (req.method === 'GET') return send(200, { content: vault ? [vault] : [], page: 0, size: 20,
        totalElements: vault ? 1 : 0, totalPages: vault ? 1 : 0 });
      if (req.method === 'POST') {
        if (vault) return error(409, 'VAULT_ALREADY_EXISTS');
        vault = { id, name: body.name, description: body.description, status: 'ACTIVE', createdAt: now(), updatedAt: now() };
        return send(201, vault);
      }
    }
    if (path === `/api/v1/vaults/${id}/assets`) {
      if (!vault) return error(404, 'RESOURCE_NOT_FOUND');
      if (req.method === 'GET') {
        const query = new URL(req.url, 'http://127.0.0.1').searchParams;
        const page = Number(query.get('page') || 0), size = Number(query.get('size') || 20);
        const sorted = [...assets].sort((a,b) => (query.get('sort') || '').startsWith('name') ? a.name.localeCompare(b.name) : b.createdAt.localeCompare(a.createdAt));
        return send(200, {content:sorted.slice(page*size,(page+1)*size),page,size,totalElements:assets.length,totalPages:Math.ceil(assets.length/size)});
      }
      if (req.method === 'POST') {
        if (!body.name?.trim() || !['TEXT','CREDENTIAL'].includes(body.assetType) || !body.payload?.trim()) return error(400,'VALIDATION_FAILED');
        const item = {id:crypto.randomUUID(),vaultId:id,name:body.name,assetType:body.assetType,description:body.description ?? null,hasPayload:true,createdAt:now(),updatedAt:now()};
        assets.unshift(item); return send(201,item);
      }
    }
    if (path === '/api/v1/dms') {
      if (req.method === 'GET') return dms ? send(200, dms) : error(404, 'RESOURCE_NOT_FOUND');
      if (req.method === 'PUT') {
        if (scenario === 'beneficiary_required') return error(422, 'BENEFICIARY_REQUIRED');
        if (!Number.isSafeInteger(body.checkIntervalDays) || body.checkIntervalDays <= 0) return error(400, 'VALIDATION_FAILED');
        dms = { ownerId: id, status: 'MONITORING', checkIntervalDays: body.checkIntervalDays, gracePeriodDays: 1,
          lastCheckInAt: null, nextCheckAt: new Date(Date.now() + body.checkIntervalDays * 86400000).toISOString(),
          triggeredAt: null, graceDeadline: null, updatedAt: now() };
        return send(200, dms);
      }
    }
    if (path === '/api/v1/dms/check-in' && req.method === 'POST') {
      if (!dms) return error(404, 'RESOURCE_NOT_FOUND');
      if (scenario === 'triggered') return error(409, 'DMS_NOT_MONITORING');
      dms = { ...dms, lastCheckInAt: now(), nextCheckAt: new Date(Date.now() + dms.checkIntervalDays * 86400000).toISOString(), updatedAt: now() };
      return send(200, dms);
    }
    return error(404, 'RESOURCE_NOT_FOUND');
  } catch { return error(400, 'MALFORMED_REQUEST'); }
});
server.listen(18175, '127.0.0.1', () => console.log('Synthetic FE contract fixture: http://127.0.0.1:18175 — no BE/DB integration'));

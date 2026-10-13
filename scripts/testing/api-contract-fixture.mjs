// FE verification only. Not a backend implementation or evidence of DB integration.
// Bind loopback only; synthetic user/token; never persist or log request bodies.
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

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
    const chunks=[]; let byteLength=0;
    for await (const chunk of req) { byteLength+=chunk.length; if (byteLength>11*1024*1024) return error(413,'PAYLOAD_TOO_LARGE'); chunks.push(chunk); }
    const bytes=Buffer.concat(chunks);
    const multipart=(req.headers['content-type'] || '').startsWith('multipart/form-data');
    const body=!multipart && bytes.length ? JSON.parse(bytes.toString('utf8')) : {};
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
    const assetPath = path.match(new RegExp('^/api/v1/vaults/([^/]+)/assets/([^/]+)$'));
    if (assetPath) {
      const item = assets.find(asset => asset.id === assetPath[2] && asset.vaultId === assetPath[1]);
      if (!item || scenario === 'asset_missing') return error(404,'RESOURCE_NOT_FOUND');
      if (scenario === 'asset_forbidden') return error(403,'ACCESS_DENIED');
      if (req.method === 'GET') return send(200,item);
      if (req.method === 'PATCH') {
        if (body.name !== undefined && (!body.name.trim() || body.name.length>150)) return error(400,'VALIDATION_FAILED');
        if (body.payload !== undefined && !body.payload.trim()) return error(400,'VALIDATION_FAILED');
        for (const field of ['name','description']) if (body[field] !== undefined) item[field]=body[field];
        if (body.payload !== undefined) item.hasPayload=true;
        item.updatedAt=now(); return send(200,item);
      }
    }
    if (path === '/api/v1/vaults/'+id+'/wills' && req.method === 'POST') {
      if (!vault) return error(404,'RESOURCE_NOT_FOUND');
      if (scenario==='will_forbidden') return error(403,'ACCESS_DENIED');
      if (scenario==='will_missing') return error(404,'RESOURCE_NOT_FOUND');
      if (scenario==='will_large') return error(413,'PAYLOAD_TOO_LARGE');
      if (!multipart) return error(415,'UNSUPPORTED_MEDIA_TYPE');
      const form=await new Request('http://127.0.0.1',{method:'POST',headers:{'content-type':req.headers['content-type']},body:bytes,duplex:'half'}).formData();
      const file=form.get('file');
      if (!file || typeof file.arrayBuffer!=='function' || !file.size || (form.get('note') || '').length>500) return error(400,'VALIDATION_FAILED');
      if (file.size>10*1024*1024) return error(413,'PAYLOAD_TOO_LARGE');
      const data=Buffer.from(await file.arrayBuffer());
      const type=data.subarray(0,5).toString()==='%PDF-'?'application/pdf':data[0]===0xff && data[1]===0xd8?'image/jpeg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
      if (!type) return error(415,'UNSUPPORTED_MEDIA_TYPE');
      return send(201,{id:randomUUID(),vaultId:id,status:scenario==='will_legal'?'LEGAL_APPROVED':'UPLOADED',createdAt:now(),currentVersion:{version:1,fileName:file.name.split(/[\\/]/).pop(),contentType:type,sizeBytes:file.size,sha256:createHash('sha256').update(data).digest('hex'),uploadedAt:now()}});
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
server.listen(18177, '127.0.0.1', () => console.log('Synthetic FE contract fixture: http://127.0.0.1:18177 — no BE/DB integration'));

import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

// Regression for the proxy fix: `xfwd: true` also sent X-Forwarded-Host, which made the backend (native forwarded
// headers) see host localhost:5196 while the proxy rewrote Origin to the API origin -> 403 "Invalid CORS request".
const { default: config } = await import('../../vite.config.js');
const api = config.server.proxy['/api'];
const apiOrigin = new URL(process.env.API_PROXY_TARGET || 'http://localhost:8080').origin;

function forward(req) {
  const headers = new Map();
  let handler;
  api.configure({ on: (event, fn) => { if (event === 'proxyReq') handler = fn; } });
  handler({ setHeader: (name, value) => headers.set(name.toLowerCase(), value) }, req);
  return headers;
}

test('the dev proxy forwards only the client IP, never the forwarded host, protocol or port', () => {
  assert.notEqual(api.xfwd, true);
  const headers = forward({ headers: { origin: 'http://localhost:5196', host: 'localhost:5196' }, socket: { remoteAddress: '::1' } });
  assert.equal(headers.get('x-forwarded-for'), '::1');
  for (const name of ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'forwarded']) {
    assert.equal(headers.has(name), false, name);
  }
});

test('a same-origin browser request keeps a matching Origin at the API hop', () => {
  const headers = forward({ headers: { origin: 'http://localhost:5198', host: 'localhost:5198' }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(headers.get('origin'), apiOrigin);
});

test('a foreign Origin is preserved so the backend can still reject it', () => {
  const headers = forward({ headers: { origin: 'http://evil.example', host: 'localhost:5196' }, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(headers.has('origin'), false);
});

test('no client address means no X-Forwarded-For is invented', () => {
  const headers = forward({ headers: { host: 'localhost:5196' }, socket: {} });
  assert.equal(headers.has('x-forwarded-for'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerWorkflow } from './ownerWorkflow.js';
test('No vault suggests creation without blocking navigation to setup screens', () => {
  const m = ownerWorkflow({ vault: null });
  assert.equal(m.next.id, 'vault');
  assert.equal(m.steps[1].state, 'blocked');
  assert.ok(m.steps.every(s => s.href));
});
test('Partial setup, complete setup and missing API data remain distinct', () => {
  const summary = { assets: { available: true, value: 2 }, configuration: { available: true, value: { ready: false } }, dms: { available: false } };
  const m = ownerWorkflow({ vault: { status: 'ACTIVE' }, summary, wills: 1 });
  assert.equal(m.next.id, 'beneficiaries');
  assert.equal(m.steps[4].state, 'waiting');
  assert.match(m.steps[4].statusLabel, /Chưa tải/);
  summary.configuration.value.ready = true;
  summary.dms = { available: true, value: { status: 'MONITORING' } };
  assert.ok(ownerWorkflow({ vault: { status: 'ACTIVE' }, summary, wills: 1 }).steps.every(s => s.state === 'done'));
});
test('Errors, loading and archived vault never prompt a new setup action', () => {
  for (const value of [{ error: true }, { loading: true }, { vault: { status: 'ARCHIVED' } }]) assert.equal(ownerWorkflow(value).next, undefined);
  assert.match(ownerWorkflow({vault: null, lang: 'en'}).message, /Create a vault/);
});

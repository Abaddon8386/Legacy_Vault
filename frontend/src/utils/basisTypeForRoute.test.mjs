import test from 'node:test';
import assert from 'node:assert/strict';
import { basisTypeForRoute } from './basisTypeForRoute.js';

test('a court document type chosen by staff survives a dossier reload', () => {
  assert.equal(basisTypeForRoute('COURT_DECISION', 'COURT'), 'COURT_DECISION');
  assert.equal(basisTypeForRoute('COURT_JUDGMENT', 'COURT'), 'COURT_JUDGMENT');
});

test('an empty or wrong type falls back to the first type valid for the route', () => {
  assert.equal(basisTypeForRoute('', 'COURT'), 'COURT_JUDGMENT');
  assert.equal(basisTypeForRoute('NOTARIAL_PARTITION', 'COURT'), 'COURT_JUDGMENT');
  assert.equal(basisTypeForRoute('', 'NOTARIAL'), 'NOTARIAL_PARTITION');
  assert.equal(basisTypeForRoute('COURT_DECISION', 'NOTARIAL'), 'NOTARIAL_PARTITION');
});

test('an unknown route leaves the current type alone', () => {
  assert.equal(basisTypeForRoute('COURT_DECISION', 'ON_HOLD'), 'COURT_DECISION');
  assert.equal(basisTypeForRoute('', undefined), '');
});

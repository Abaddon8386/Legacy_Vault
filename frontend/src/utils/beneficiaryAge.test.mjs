import test from 'node:test';
import assert from 'node:assert/strict';
import { beneficiaryAge } from './beneficiaryAge.js';

test('calendar age changes on the birthday, including the eighteenth birthday', () => {
  const today = new Date(2026, 9, 19);
  assert.equal(beneficiaryAge('2008-10-19', today), 18);
  assert.equal(beneficiaryAge('2008-10-20', today), 17);
  assert.equal(beneficiaryAge('2008-10-18', today), 18);
  assert.equal(beneficiaryAge('2026-10-19', today), 0);
});

test('missing, impossible and future birthdays do not imply adulthood', () => {
  for (const value of ['', null, 'bad', '2024-02-30', '2027-01-01']) {
    assert.equal(beneficiaryAge(value, new Date(2026, 9, 19)), null);
  }
  assert.equal(beneficiaryAge('2008-02-29', new Date(2026, 1, 28)), 17);
});

test('invalid reference clock does not imply an age',()=>{assert.equal(beneficiaryAge('2000-01-01',new Date('invalid')),null);});

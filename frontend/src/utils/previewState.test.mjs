import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRoute, readPreviewSchedule, writePreviewSchedule } from './previewState.js';
import { saveDmsConfig, checkInDms, fetchDmsConfig } from './dmsService.js';
test('Preview navigation retains scenario aliases and language across screens', () => {
  assert.equal(previewRoute('dms', '?preview=true&scenario=api_error', 'en'), '/dms?preview=true&scenario=network_error&lang=en');
  assert.equal(previewRoute('vault', '?scenario=overdue', 'vi'), '/vault?preview=true&scenario=triggered&lang=vi');
});
test('Preview save and check-in remain visible on both screens and keep the chosen interval', async () => {
  const options = { isDevPreview: true, scenario: 'not_configured' };
  const saved = await saveDmsConfig({ checkIntervalDays: 60 }, options);
  assert.equal((await fetchDmsConfig(options)).nextCheckAt, saved.nextCheckAt);
  const checked = await checkInDms(options);
  assert.equal(checked.checkIntervalDays, 60);
  assert.equal(Date.parse(checked.nextCheckAt) - Date.parse(checked.lastCheckInAt), 60 * 86400000);
  assert.equal(readPreviewSchedule('not_configured', () => null).nextCheckAt, checked.nextCheckAt);
  writePreviewSchedule('not_configured', null);
});

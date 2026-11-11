import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Unified Tabs CSS Architecture: content-width, left-aligned, active token and touch targets', () => {
  const foundationCss = readFileSync(resolve('src/components/layout/WorkspaceFoundation.css'), 'utf8');
  const staffDocsCss = readFileSync(resolve('src/pages/staff/StaffLegalDocumentsPage.css'), 'utf8');
  const legalLiveCss = readFileSync(resolve('src/pages/legal/LegalLiveWorkflow.css'), 'utf8');
  const closeArchiveCss = readFileSync(resolve('src/pages/staff/CloseAndArchivePage.css'), 'utf8');
  const liveHandoverCss = readFileSync(resolve('src/pages/staff/LiveHandoverPage.css'), 'utf8');
  const staffLiveCss = readFileSync(resolve('src/pages/staff/StaffLiveCase.css'), 'utf8');

  // Verify foundation rules
  assert.ok(foundationCss.includes('.lv-shared-tabs'), 'WorkspaceFoundation.css must include .lv-shared-tabs');
  assert.ok(foundationCss.includes('justify-content: flex-start'), 'Tabs must be left-aligned');
  assert.ok(foundationCss.includes('border-bottom: 2px solid var(--lv-action-primary, #164639)'), 'Active tab must use --lv-action-primary');
  assert.ok(foundationCss.includes('min-height: 44px'), 'Tab touch target must be at least 44px');
  assert.ok(foundationCss.includes('overflow-x: auto'), 'Tabs must support horizontal scroll on mobile');

  // Verify StaffLegalDocumentsPage.css tabs have no grid columns or flex: 1 0 auto stretching
  assert.ok(!staffDocsCss.includes('.lv-staff-tabs-nav {\n  display: grid'), 'Staff tabs must not split into equal grid columns');
  assert.ok(!staffDocsCss.includes('.lv-staff-tab-btn { flex: 1 0 auto;'), 'Staff tabs must not stretch evenly across container');
  assert.ok(staffDocsCss.includes('.lv-staff-tab-dot'), 'Staff tabs must preserve status dots');
  assert.ok(staffDocsCss.includes('.lv-staff-tab-count'), 'Staff tabs must preserve count badge');

  // Verify LegalLiveWorkflow.css has content-width tabs
  assert.ok(!legalLiveCss.includes('.lv-legal-tab { flex: 1 0 auto;'), 'Legal tabs must not stretch 50/50 across container');
  assert.ok(legalLiveCss.includes('.lv-legal-tab__dot'), 'Legal tabs must preserve dot indicators');

  // Verify CloseAndArchivePage.css has content-width tabs
  assert.ok(!closeArchiveCss.includes('.lv-ca-tab {\n  flex: 1 0 auto;'), 'Close & Archive tabs must not stretch evenly');

  // Verify LiveHandoverPage.css has content-width tabs
  assert.ok(!liveHandoverCss.includes('.lv-handover-tab {\n  flex: 1 0 auto;'), 'Handover tabs must not stretch evenly');

  // Verify StaffLiveCase.css has unified tabs
  assert.ok(staffLiveCss.includes('.lv-intake-tabs'), 'Staff Live intake tabs must be defined');
});

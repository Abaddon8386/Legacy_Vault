import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appShellJsxPath = resolve('src/components/layout/AppShell.jsx');
const appShellCssPath = resolve('src/components/layout/AppShell.css');

test('sidebarGroups: Staff role renders THỰC THI HỒ SƠ in VI and CASE EXECUTION in EN', () => {
  const jsx = readFileSync(appShellJsxPath, 'utf8');

  // Verify Vietnamese section title for staff
  assert.match(
    jsx,
    /navSectionTitle:\s*isStaff\s*\?\s*'THỰC THI HỒ SƠ'/i,
    'AppShell must provide THỰC THI HỒ SƠ section title for staff in Vietnamese'
  );

  // Verify English section title for staff
  assert.match(
    jsx,
    /navSectionTitle:\s*isStaff\s*\?\s*'CASE EXECUTION'/i,
    'AppShell must provide CASE EXECUTION section title for staff in English'
  );
});

test('sidebarGroups: Legal and Owner role headings remain intact across VI and EN', () => {
  const jsx = readFileSync(appShellJsxPath, 'utf8');

  assert.match(jsx, /'THẨM ĐỊNH PHÁP LÝ'/, 'Legal section title in VI must remain intact');
  assert.match(jsx, /'LEGAL VERIFICATION'/, 'Legal section title in EN must remain intact');
  assert.match(jsx, /'QUẢN LÝ DI SẢN'/, 'Owner section title in VI must remain intact');
  assert.match(jsx, /'HERITAGE PORTAL'/, 'Owner section title in EN must remain intact');
  assert.match(jsx, /'QUẢN TRỊ'/, 'Admin section title in VI must remain intact');
  assert.match(jsx, /'ADMINISTRATION'/, 'Admin section title in EN must remain intact');
});

test('sidebarGroups: Staff navigation registry includes all 6 workflow execution steps', () => {
  const jsx = readFileSync(appShellJsxPath, 'utf8');

  const requiredSteps = [
    { id: 'cases', labelVi: 'Hồ sơ xác minh', labelEn: 'Verification Cases' },
    { id: 'legal-documents', labelVi: 'Giấy tờ và phân bổ', labelEn: 'Documents & allocations' },
    { id: 'asset-handover', labelVi: 'Bàn giao tài sản', labelEn: 'Asset Handover' },
    { id: 'beneficiary-confirmation', labelVi: 'Xác nhận đã nhận tài sản', labelEn: 'Asset receipt confirmation' },
    { id: 'completion-progress', labelVi: 'Tiến độ hoàn tất', labelEn: 'Completion Progress' },
    { id: 'close-and-archive', labelVi: 'Đóng và lưu trữ hồ sơ', labelEn: 'Close & Archive' },
  ];

  for (const step of requiredSteps) {
    assert.match(jsx, new RegExp(`id:\\s*'${step.id}'`), `Staff navigation must include step ${step.id}`);
    assert.match(jsx, new RegExp(step.labelVi), `Staff navigation must include label ${step.labelVi}`);
    assert.match(jsx, new RegExp(step.labelEn), `Staff navigation must include label ${step.labelEn}`);
  }
});

test('sidebarGroups: CSS styling for lv-nav-heading and drawer responsiveness at ~700px', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Heading styling
  assert.match(css, /\.lv-nav-heading\s*\{[^}]*text-transform:\s*uppercase/);
  assert.match(css, /\.lv-nav-heading\s*\{[^}]*font-weight:\s*600/);

  // Responsive drawer at <= 960px covering 700px/768px
  assert.match(css, /@media\s*\(max-width:\s*960px\)[\s\S]*?\.lv-shell-sidebar\s*\{/);
  assert.match(css, /transform:\s*translateX\([^)]+\)/);
});

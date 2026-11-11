import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accountProfileI18n } from '../pages/account/accountProfileI18n.js';

const emailVerificationJsxPath = resolve('src/pages/auth/EmailVerification.jsx');
const accountProfileJsxPath = resolve('src/pages/account/AccountProfilePage.jsx');
const accountProfileCssPath = resolve('src/pages/account/AccountProfilePage.css');

test('accountProfileStatusUi: Email verification badge and button rendering according to status', () => {
  const jsx = readFileSync(emailVerificationJsxPath, 'utf8');

  // 1. Verified badge display in VI and EN
  assert.match(
    jsx,
    /data\.verified\s*\?\s*\(en\s*\?\s*'Email verified'\s*:\s*'Email đã xác minh'\)/,
    'Must display Email đã xác minh in VI and Email verified in EN when verified'
  );

  // 2. Unverified badge display in VI and EN
  assert.match(
    jsx,
    /en\s*\?\s*'Email not verified'\s*:\s*'Email chưa xác minh'/,
    'Must display Email chưa xác minh in VI and Email not verified in EN when unverified'
  );

  // 3. Status badges have semantic classes
  assert.match(
    jsx,
    /className=\{`lv-email-status-badge\s*\$\{data\.verified\s*\?\s*'is-verified'\s*:\s*'is-unverified'\}`\}/,
    'Badge must apply is-verified or is-unverified class'
  );

  // 4. Secondary/ghost refresh button text for checking status
  assert.match(
    jsx,
    /'Kiểm tra lại trạng thái'/,
    'Must offer Kiểm tra lại trạng thái button'
  );

  // 5. Unverified renders primary action button for resending verification email
  assert.match(
    jsx,
    /en\s*\?\s*'Resend verification email'\s*:\s*'Gửi lại email xác minh'/,
    'Must offer Gửi lại email xác minh when unverified'
  );
});

test('accountProfileStatusUi: Action hierarchy in AccountProfilePage (Primary Edit + Ghost Refresh with tooltip)', () => {
  const jsx = readFileSync(accountProfileJsxPath, 'utf8');
  const css = readFileSync(accountProfileCssPath, 'utf8');

  // Edit button is primary
  assert.match(
    jsx,
    /className="lv-profile-edit-btn\s+is-primary"/,
    'Edit profile button must have is-primary class'
  );
  assert.match(
    css,
    /\.lv-profile-edit-btn\s*\{[^}]*background:\s*var\(--lv-action-primary/i,
    'Edit profile button must use primary forest background'
  );

  // Refresh button is ghost button with title tooltip
  assert.match(
    jsx,
    /className="lv-profile-refresh-btn\s+lv-btn-ghost"/,
    'Refresh button must have lv-btn-ghost class'
  );
  assert.match(
    jsx,
    /title=\{!session\?\.accessToken\s*\?\s*t\.unavailableNotice\s*:\s*\(isRefreshing\s*\?\s*t\.btnRefreshing\s*:\s*t\.btnRefresh\)\}/,
    'Refresh button must provide title tooltip for status and accessibility'
  );
  assert.match(
    css,
    /\.lv-profile-refresh-btn\s*\{[^}]*background:\s*transparent/i,
    'Refresh button must have ghost styling (transparent background)'
  );
});

test('accountProfileStatusUi: Bilingual completeness for VI and EN dictionaries', () => {
  const viKeys = Object.keys(accountProfileI18n.vi);
  const enKeys = Object.keys(accountProfileI18n.en);

  assert.ok(viKeys.length >= 25, 'VI dictionary must contain all required UI keys');
  assert.deepEqual(
    viKeys.sort(),
    enKeys.sort(),
    'VI and EN dictionaries in accountProfileI18n must have matching keys'
  );

  // Verify key actions
  assert.equal(accountProfileI18n.vi.btnEditProfile, 'Chỉnh sửa hồ sơ');
  assert.equal(accountProfileI18n.en.btnEditProfile, 'Edit Profile');
  assert.equal(accountProfileI18n.vi.btnRefresh, 'Làm mới thông tin');
  assert.equal(accountProfileI18n.en.btnRefresh, 'Refresh Details');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetService } from '../services/assetService.js';
import { willService, readWillReceipt, readWillVersionReceipt } from './willService.js';
import { ASSET_I18N } from '../pages/assets/assetI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vaultId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const willId = '33333333-3333-4333-8333-333333333333';

test('UI Focus: Sai mật khẩu (403 REAUTH_FAILED) ném lỗi riêng, không gây logout (không phải 401)', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 'REAUTH_FAILED', message: 'Invalid password' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

    let logoutTriggered = false;
    const onUnauthorized = () => {
      logoutTriggered = true;
    };

    try {
      await assetService.revealAsset(vaultId, assetId, 'WrongPass123!');
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'REAUTH_FAILED');
      // UI pattern: only 401 invokes onUnauthorized
      if (err.status === 401) {
        onUnauthorized();
      }
    }
    assert.equal(logoutTriggered, false, 'Sai mật khẩu tuyệt đối không kích hoạt logout');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UI Focus: HTTP 403 thiếu code REAUTH_FAILED phải trả lỗi truy cập chung (FORBIDDEN), không được suy diễn sai mật khẩu', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Giả lập server trả 403 không có body hoặc không có trường code REAUTH_FAILED
    globalThis.fetch = async () =>
      new Response('Forbidden Access', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' },
      });

    try {
      await willService.downloadWillVersion(vaultId, willId, 1, 'AnyPass123!');
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN', 'HTTP 403 không có code hợp lệ phải là FORBIDDEN, không suy diễn REAUTH_FAILED');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UI Focus: Đóng khi request đang chạy - AbortController hủy request thành công', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (_url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    };

    const promise = assetService.revealAsset(vaultId, assetId, 'ValidPass123!', {
      signal: controller.signal,
    });
    // Giả lập người dùng đóng modal ngay sau khi bấm xác nhận
    controller.abort();

    await assert.rejects(promise, (err) => err.name === 'AbortError');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UI Focus: Kiểm tra phiên bản tăng nghiêm ngặt theo phiên bản hiện tại của hồ sơ', () => {
  const file = { name: 'di-chuc.pdf', size: 1024, type: 'application/pdf' };
  const clientSha256 = 'a'.repeat(64);

  // Hồ sơ hiện tại đang ở version 3
  const currentHighestVersion = 3;
  const expectedMinVersion = currentHighestVersion + 1; // phải >= 4

  const willData = {
    id: willId,
    vaultId,
    status: 'UPLOADED',
    createdAt: '2026-10-14T00:00:00Z',
    currentVersion: {
      version: 3,
      fileName: 'di-chuc.pdf',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      sha256: clientSha256,
      uploadedAt: '2026-10-14T00:00:00Z',
    },
  };

  // Trả về version 3 (không tăng): phải BỊ TỪ CHỐI
  assert.throws(
    () => readWillVersionReceipt(willData, vaultId, willId, file, clientSha256, expectedMinVersion),
    (err) => err.code === 'BACKEND_NOT_READY',
    'Phiên bản không lớn hơn phiên bản hiện tại phải bị từ chối'
  );

  // Trả về version 2 (cũ hơn): phải BỊ TỪ CHỐI
  const willDataV2 = {
    ...willData,
    currentVersion: { ...willData.currentVersion, version: 2 },
  };
  assert.throws(
    () => readWillVersionReceipt(willDataV2, vaultId, willId, file, clientSha256, expectedMinVersion),
    (err) => err.code === 'BACKEND_NOT_READY',
    'Phiên bản nhỏ hơn phiên bản hiện tại phải bị từ chối'
  );

  // Trả về version 4 (tăng hợp lệ): CHẤP NHẬN
  const willDataV4 = {
    ...willData,
    currentVersion: { ...willData.currentVersion, version: 4 },
  };
  const receiptV4 = readWillVersionReceipt(willDataV4, vaultId, willId, file, clientSha256, expectedMinVersion);
  assert.equal(receiptV4.currentVersion.version, 4);

  // Trả về version 5 (tăng cao hơn dự kiến do có phiên khác upload trước): VẪN CHẤP NHẬN
  const willDataV5 = {
    ...willData,
    currentVersion: { ...willData.currentVersion, version: 5 },
  };
  const receiptV5 = readWillVersionReceipt(willDataV5, vaultId, willId, file, clientSha256, expectedMinVersion);
  assert.equal(receiptV5.currentVersion.version, 5, 'Phiên bản tăng cao hơn dự kiến do cập nhật đồng thời vẫn phải được chấp nhận');

  // Khởi tạo hồ sơ ban đầu: CHỈ chấp nhận version === 1
  const willDataV1 = {
    ...willData,
    currentVersion: { ...willData.currentVersion, version: 1 },
  };
  assert.equal(readWillReceipt(willDataV1, vaultId, file, clientSha256).currentVersion.version, 1);
  assert.throws(
    () => readWillReceipt(willDataV4, vaultId, file, clientSha256),
    (err) => err.code === 'BACKEND_NOT_READY',
    'Tạo mới hồ sơ không được có version > 1'
  );
});

test('UI Focus: Nhãn mật khẩu chuẩn hóa thành “Mật khẩu đăng nhập hiện tại” / “Current login password”', () => {
  assert.equal(
    ASSET_I18N.vi.assets.detailModal.passwordLabel,
    'Mật khẩu đăng nhập hiện tại',
    'Tiếng Việt phải dùng "Mật khẩu đăng nhập hiện tại", không gọi là mật khẩu kho'
  );
  assert.equal(
    ASSET_I18N.en.assets.detailModal.passwordLabel,
    'Current login password',
    'Tiếng Anh phải dùng "Current login password"'
  );
  for (const lang of ['vi', 'en']) {
    const dict = ASSET_I18N[lang]?.assets;
    assert.ok(dict.detailModal.passwordPrompt.includes('mật khẩu đăng nhập hiện tại') || dict.detailModal.passwordPrompt.includes('current login password'));
    assert.ok(!dict.detailModal.passwordPrompt.toLowerCase().includes('mật khẩu kho'));
  }
});

test('UI Focus: CSS responsive mobile layout (@media max-width: 768px)', () => {
  const cssPath = path.resolve(__dirname, '../pages/wills/WillUploadPage.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert.ok(
    cssContent.includes('@media (max-width: 768px)'),
    'WillUploadPage.css phải có responsive rules cho mobile'
  );
  assert.ok(cssContent.includes('overflow-x: auto'), 'Bảng danh sách/phiên bản phải có thanh cuộn ngang khi trên mobile');
});

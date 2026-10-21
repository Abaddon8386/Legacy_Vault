import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createLiveReceivedAssetActions } from '../services/receivedAssetService.js';
import { createSession, storeSession } from './session.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/beneficiary' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

function changeInput(element, value) {
  const win = dom.window;
  const proto = win.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor.set.call(element, value);
  const reactPropsKey = Object.keys(element).find(k => k.startsWith('__reactProps$'));
  if (reactPropsKey && typeof element[reactPropsKey]?.onChange === 'function') {
    element[reactPropsKey].onChange({ target: { value } });
  } else {
    element.dispatchEvent(new win.Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new win.Event('change', { bubbles: true, cancelable: true }));
  }
}

async function loadComponentModule(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const { default: App } = await loadComponentModule('src/App.jsx');

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId = '11111111-1111-4111-8111-111111111111';
const imageId = '22222222-2222-4222-8222-222222222222';

test('App + Live Adapter: REAUTH_FAILED keeps modal open for retry, unlocks content & images, and ACCESS_DENIED dismisses', async () => {
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const oldFetch = globalThis.fetch;
  URL.createObjectURL = () => 'blob:decrypted-image';
  URL.revokeObjectURL = () => {};

  const user = {
    id: userId,
    fullName: 'Người thụ hưởng',
    email: 'beneficiary@test.com',
    roles: ['BENEFICIARY'],
  };
  storeSession(createSession({
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    user,
  }));
  window.history.replaceState({}, '', '/beneficiary');

  let simulateAccessDenied = false;

  const fakeFetch = async (url, init = {}) => {
    if (String(url).includes('/auth/me')) {
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (String(url).includes('/received-assets?')) {
      return new Response(JSON.stringify({
        content: [{
          itemId,
          assetId: itemId,
          vaultId: itemId,
          vaultName: 'Kho di sản Hoàng Gia',
          name: 'Di chúc bảo mật số 01',
          assetType: 'DOCUMENT',
          deliveredAt: '2026-10-21T08:00:00Z',
          status: 'DELIVERED',
          imageCount: 1,
          hasContent: true,
        }],
        page: 0,
        size: 5,
        totalElements: 1,
        totalPages: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (String(url).endsWith(`/received-assets/${itemId}`)) {
      return new Response(JSON.stringify({
        itemId,
        assetId: itemId,
        vaultId: itemId,
        vaultName: 'Kho di sản Hoàng Gia',
        name: 'Di chúc bảo mật số 01',
        assetType: 'DOCUMENT',
        deliveredAt: '2026-10-21T08:00:00Z',
        status: 'DELIVERED',
        imageCount: 1,
        hasContent: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (String(url).endsWith(`/received-assets/${itemId}/images`)) {
      return new Response(JSON.stringify([{
        id: imageId,
        fileName: 'chung_thu.png',
        contentType: 'image/png',
        sizeBytes: 2048,
        createdAt: '2026-10-21T08:00:00Z',
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (String(url).endsWith(`/received-assets/${itemId}/content`)) {
      if (simulateAccessDenied) {
        return new Response(JSON.stringify({ code: 'ACCESS_DENIED', message: 'Mất quyền truy cập tài sản' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(init.body || '{}');
      // DEBUG LOG
      if (body.password !== 'CorrectPassword123') {
        return new Response(JSON.stringify({ code: 'REAUTH_FAILED', message: 'Mật khẩu không đúng' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        itemId,
        assetId: itemId,
        payload: 'NỘI DUNG GIẢI MÃ THÀNH CÔNG: Toàn bộ di sản trao cho con trai cả.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (String(url).includes('/download')) {
      const body = JSON.parse(init.body || '{}');
      if (body.password !== 'CorrectPassword123') {
        return new Response(JSON.stringify({ code: 'REAUTH_FAILED', message: 'Mật khẩu ảnh không đúng' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }

    return new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };

  globalThis.fetch = fakeFetch;

  const liveAdapter = createLiveReceivedAssetActions({
    accessToken: 'test-token',
    userId,
    fetchFn: fakeFetch,
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(App, { beneficiaryAssetActions: liveAdapter }));
    });

    // Chờ list load
    assert.match(host.textContent, /Di chúc bảo mật số 01/);

    // 1. Click "Xem chi tiết" để mở modal
    const detailBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Xem chi tiết'));
    assert.ok(detailBtn);
    await act(async () => detailBtn.click());

    let dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog, 'Modal must be open');

    // 2. Click "Xem nội dung" (không có password ban đầu) -> 403 REAUTH_FAILED
    const viewContentBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Xem nội dung'));
    assert.ok(viewContentBtn);
    await act(async () => viewContentBtn.click());

    // Modal KHÔNG ĐƯỢC ĐÓNG!
    dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog, 'Modal must NOT close on 403 REAUTH_FAILED');

    // Password input form phải xuất hiện
    let pwdInput = dialog.querySelector('input[aria-label="Mật khẩu xem nội dung"]');
    assert.ok(pwdInput, 'Password input must be displayed');

    function submitForm(btn) {
      const form = btn.closest('form');
      if (form) {
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      }
    }

    // 3. Nhập mật khẩu SAI -> submit
    await act(async () => {
      changeInput(pwdInput, 'WrongPassword');
    });

    let decryptBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Giải mã & Xem'));
    assert.ok(decryptBtn);
    await act(async () => submitForm(decryptBtn));

    // Modal vẫn mở, thông báo lỗi sai mật khẩu hiển thị
    dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog, 'Modal must still stay open after wrong password');
    assert.match(dialog.textContent, /Xác thực mật khẩu không đúng/);

    // 4. Nhập mật khẩu ĐÚNG -> submit
    pwdInput = dialog.querySelector('input[aria-label="Mật khẩu xem nội dung"]');
    assert.ok(pwdInput, 'Password input must still be present for retry');
    await act(async () => {
      changeInput(pwdInput, 'CorrectPassword123');
    });
    decryptBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Giải mã & Xem'));
    await act(async () => submitForm(decryptBtn));

    // Nội dung giải mã hiển thị thành công!
    assert.match(dialog.textContent, /Toàn bộ di sản trao cho con trai cả/);

    // 5. Thử nghiệm với Ảnh: Bấm "Xem ảnh" -> form yêu cầu password ảnh
    const viewImageBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Xem ảnh'));
    assert.ok(viewImageBtn);
    await act(async () => viewImageBtn.click());

    // Form password ảnh hiện ra, modal vẫn mở
    dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog, 'Modal remains open when image requires reauth');
    let imgPwdInput = dialog.querySelector('input[aria-label="Mật khẩu xem ảnh"]');
    assert.ok(imgPwdInput, 'Image password input must appear');

    // Nhập sai mật khẩu ảnh
    await act(async () => {
      changeInput(imgPwdInput, 'WrongImgPwd');
    });
    let decryptImgBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Giải mã & Xem'));
    await act(async () => submitForm(decryptImgBtn));

    // Modal vẫn mở, báo lỗi sai mật khẩu
    dialog = document.querySelector('[role=dialog]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /Xác thực mật khẩu không đúng/);

    // Nhập đúng mật khẩu ảnh
    imgPwdInput = dialog.querySelector('input[aria-label="Mật khẩu xem ảnh"]');
    await act(async () => {
      changeInput(imgPwdInput, 'CorrectPassword123');
    });
    decryptImgBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Giải mã & Xem'));
    await act(async () => submitForm(decryptImgBtn));

    // Ảnh hiển thị thành công!
    const imgEl = dialog.querySelector('img.lv-received-image__img');
    assert.ok(imgEl, 'Decrypted image must be rendered');
    assert.equal(imgEl.getAttribute('src'), 'blob:decrypted-image');

    // 6. Ẩn nội dung để test lại luồng mất quyền thật (ACCESS_DENIED)
    const hideBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Ẩn nội dung'));
    assert.ok(hideBtn);
    await act(async () => hideBtn.click());

    // Bật cờ simulateAccessDenied
    simulateAccessDenied = true;
    const viewContentAgainBtn = [...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Xem nội dung'));
    assert.ok(viewContentAgainBtn);
    await act(async () => viewContentAgainBtn.click());

    pwdInput = dialog.querySelector('input[aria-label="Mật khẩu xem nội dung"]');
    await act(async () => changeInput(pwdInput, 'CorrectPassword123'));
    await act(async () => submitForm(pwdInput.closest('form').querySelector('button[type=submit]')));

    // Khi gặp ACCESS_DENIED thật: modal đóng ngay và private content biến mất
    dialog = document.querySelector('[role=dialog]');
    assert.equal(dialog === null, true, 'Modal must close on real ACCESS_DENIED');
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
    globalThis.fetch = oldFetch;
    await act(async () => root.unmount());
    host.remove();
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
});

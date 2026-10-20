import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { dmsStatusMessages } from './dmsService.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/dms' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function buildComponent(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const DMSOverviewPage = await buildComponent('src/pages/dms/DMSOverviewPage.jsx');

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setInputValue(input, val) {
  const reactPropsKey = Object.keys(input).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && input[reactPropsKey]?.onChange) {
    input[reactPropsKey].onChange({ target: { value: val } });
  } else {
    input.value = val;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
}

// 1. StrictMode Initial Load: API returns 60 -> input and overview both show 60
test('DMS StrictMode - initial load: API returns 60, input and overview both show 60', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: 60,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-12-14T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.ok(input, 'Interval input should be rendered');
    assert.equal(input.value, '60', 'Input must display 60 from API in StrictMode');

    // Verify overview reflects 60 days
    const overviewText = host.textContent;
    assert.ok(overviewText.includes('60'), 'Overview must display interval of 60 days');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 2. StrictMode Initial Load Cleanup/Replay: response applied properly after effect replay
test('DMS StrictMode - initial load cleanup/replay: new response properly applied', async () => {
  const deferred1 = createDeferred();
  const deferred2 = createDeferred();
  let callCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    callCount++;
    if (callCount === 1) {
      return deferred1.promise;
    }
    return deferred2.promise;
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    let renderPromise;
    await act(async () => {
      renderPromise = root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    // In StrictMode, 2 calls are initiated due to setup -> cleanup -> setup
    assert.ok(callCount >= 2, 'StrictMode should invoke effect twice on mount');

    // First call is aborted/ignored, resolve second call with 60
    await act(async () => {
      deferred1.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 45,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-11-29T00:00:00Z',
        })
      );
      deferred2.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 60,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-12-14T00:00:00Z',
        })
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.ok(input);
    assert.equal(input.value, '60', 'Input must receive 60 from active setup call in StrictMode');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 3. StrictMode Proactive Refresh from 30 to 60
test('DMS StrictMode - refresh from 30 to 60 in StrictMode', async () => {
  let apiInterval = 30;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: apiInterval,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-11-14T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // 1. Initial render with 30
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 0,
          })
        )
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.equal(input.value, '30', 'Initial input should be 30');

    // 2. Server updates to 60, onRefreshTrigger increments to 1
    apiInterval = 60;
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 1,
          })
        )
      );
    });

    assert.equal(input.value, '60', 'Input must update to 60 on refresh in StrictMode');
    assert.ok(host.textContent.includes('60'), 'Overview must reflect refreshed 60 days');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 4. Refresh in-flight when language changes in StrictMode
test('DMS StrictMode - in-flight refresh when language changes: latest response still syncs input to 60', async () => {
  let initialLoaded = false;
  const refreshDeferredVi = createDeferred();
  const refreshDeferredEn = createDeferred();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    if (!initialLoaded) {
      return Promise.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 30,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-11-14T00:00:00Z',
        })
      );
    }
    // Check Accept-Language header
    const lang = options?.headers?.['Accept-Language'];
    if (lang === 'en') {
      return refreshDeferredEn.promise;
    }
    return refreshDeferredVi.promise;
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // Initial mount
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 0,
          })
        )
      );
    });

    initialLoaded = true;
    const input = host.querySelector('#dms-interval-input');
    assert.equal(input.value, '30');

    // Trigger refresh with onRefreshTrigger = 1 (in-flight VI request)
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 1,
          })
        )
      );
    });

    // Before VI request resolves, user switches language to EN
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'en',
            onRefreshTrigger: 1,
          })
        )
      );
    });

    // Resolve EN request with 60
    await act(async () => {
      refreshDeferredEn.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 60,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-12-14T00:00:00Z',
        })
      );
    });

    assert.equal(input.value, '60', 'Input must sync to 60 even when language changed mid-refresh');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 5. Language change when user typed 181: keeps 181, error changes VI/EN correctly
test('DMS StrictMode - language change when user typed 181: keeps 181, error changes VI/EN correctly', async () => {
  let saveApiCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options && options.method === 'PUT') {
      saveApiCalled = true;
      return json({ status: 'MONITORING', checkIntervalDays: 30 });
    }
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: 30,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-11-14T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.ok(input);
    assert.equal(input.value, '30');

    // User types 181 (> 180)
    await act(async () => {
      setInputValue(input, '181');
    });
    assert.equal(input.value, '181');

    // Submit form -> triggers validation error
    const form = host.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(saveApiCalled, false, 'API must not be called when invalid');
    const errorSpanVi = host.querySelector('#dms-interval-error');
    assert.ok(errorSpanVi);
    assert.equal(errorSpanVi.textContent.trim(), dmsStatusMessages.vi.intervalMax);

    // Switch to EN
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'en',
          })
        )
      );
    });

    // Assert: User input 181 is preserved, not overwritten by fetch on language switch
    assert.equal(input.value, '181', 'User uncommitted draft 181 must be preserved on lang switch');

    // Assert: Error message switches to English
    const errorSpanEn = host.querySelector('#dms-interval-error');
    assert.ok(errorSpanEn);
    assert.equal(errorSpanEn.textContent.trim(), dmsStatusMessages.en.intervalMax);

    // Correct input to 90
    await act(async () => {
      setInputValue(input, '90');
    });
    assert.equal(host.querySelector('#dms-interval-error'), null, 'Error clears on valid input');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 6. Response cũ đến muộn bị bỏ qua (Race condition protection)
test('DMS StrictMode - stale response coming late is ignored', async () => {
  let initialResolved = false;
  const deferred1 = createDeferred();
  const deferred2 = createDeferred();
  let refreshCallIdx = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    if (!initialResolved) {
      return Promise.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 30,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-11-14T00:00:00Z',
        })
      );
    }
    refreshCallIdx++;
    if (refreshCallIdx === 1) {
      return deferred1.promise;
    }
    return deferred2.promise;
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // Initial mount completes with 30
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 0,
          })
        )
      );
    });

    initialResolved = true;
    const input = host.querySelector('#dms-interval-input');
    assert.ok(input);
    assert.equal(input.value, '30');

    // Request 1 starts (deferred1)
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 1,
          })
        )
      );
    });

    // Request 2 starts immediately (deferred2)
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
            onRefreshTrigger: 2,
          })
        )
      );
    });

    // Request 2 completes first with 60
    await act(async () => {
      deferred2.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 60,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-12-14T00:00:00Z',
        })
      );
    });

    assert.equal(input.value, '60');

    // Delayed Request 1 arrives later with 15
    await act(async () => {
      deferred1.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 15,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-10-30T00:00:00Z',
        })
      );
    });

    // Assert: Input remains 60, not overwritten by delayed 15
    assert.equal(input.value, '60', 'Delayed stale response must not overwrite newer data');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 7. Đổi owner, bao gồm request owner cũ đang chờ
test('DMS StrictMode - owner change including pending previous owner request', async () => {
  const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const deferredA = createDeferred();
  const deferredB = createDeferred();
  let fetchCallCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCallCount++;
    if (fetchCallCount <= 2) {
      return deferredA.promise;
    }
    return deferredB.promise;
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // Mount owner A (request A pending)
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            ownerId: ownerA,
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    // Before request A resolves, owner changes to owner B
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            ownerId: ownerB,
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    // Resolve old request A first (with 30)
    await act(async () => {
      deferredA.resolve(
        json({
          ownerId: ownerA,
          status: 'MONITORING',
          checkIntervalDays: 30,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-11-14T00:00:00Z',
        })
      );
    });

    // Resolve request B with 90
    await act(async () => {
      deferredB.resolve(
        json({
          ownerId: ownerB,
          status: 'MONITORING',
          checkIntervalDays: 90,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2027-01-13T00:00:00Z',
        })
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.ok(input, 'Interval input should exist for owner B');
    assert.equal(input.value, '90', 'Must reflect Owner B configuration (90), not Owner A (30)');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 8. API trả >180: giữ nguyên; submit bị chặn và có thông báo
test('DMS StrictMode - API returns > 180: kept as-is, submit blocked with error', async () => {
  let saveApiCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options && options.method === 'PUT') {
      saveApiCalled = true;
      return json({ status: 'MONITORING', checkIntervalDays: 200 });
    }
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: 200,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-11-14T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    const input = host.querySelector('#dms-interval-input');
    assert.equal(input.value, '200', 'API value 200 must be preserved as-is without clamping');
    assert.equal(saveApiCalled, false, 'No automatic save when interval > 180');

    // Attempt submit
    const form = host.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    assert.equal(saveApiCalled, false, 'Submit must be blocked, save API not called');
    const errorSpan = host.querySelector('#dms-interval-error');
    assert.ok(errorSpan);
    assert.equal(errorSpan.textContent.trim(), dmsStatusMessages.vi.intervalMax);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 9. Unmount không cập nhật state từ request cũ
test('DMS StrictMode - unmount does not update state from old request', async () => {
  const deferred = createDeferred();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => deferred.promise;

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    // Unmount before request resolves
    await act(async () => {
      root.unmount();
    });

    // Now resolve request: should not throw unhandled error or update unmounted component
    await act(async () => {
      deferred.resolve(
        json({
          ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'MONITORING',
          checkIntervalDays: 60,
          gracePeriodDays: 1,
          lastCheckInAt: '2026-10-15T00:00:00Z',
          nextCheckAt: '2026-12-14T00:00:00Z',
        })
      );
    });
    assert.ok(true, 'Resolution after unmount completed cleanly without exceptions');
  } finally {
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 10. Manual retry in StrictMode
test('DMS StrictMode - manual retry updates interval input to new API configuration', async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    callCount++;
    if (callCount <= 2) {
      // First attempt (initial mount + strict mode setup) fails with 500
      return new Response(JSON.stringify({ code: 'SERVER_ERROR' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Retry succeeds with 45 days
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: 45,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-11-29T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(DMSOverviewPage, {
            vaultId: 'vlt-test',
            accessToken: 'synthetic',
            lang: 'vi',
          })
        )
      );
    });

    // First call failed -> Error alert with retry button
    const retryBtn = host.querySelector('.lv-error-state button');
    assert.ok(retryBtn, 'Retry button should be displayed upon error');

    // Click retry button
    await act(async () => {
      retryBtn.click();
    });

    const input = host.querySelector('#dms-interval-input');
    assert.ok(input, 'Input must be rendered after retry in StrictMode');
    assert.equal(input.value, '45', 'Input must sync to 45 after retry in StrictMode');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

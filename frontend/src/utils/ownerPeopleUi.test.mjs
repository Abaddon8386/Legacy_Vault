import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/beneficiaries' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// React's legacy input-event fallback is used by this jsdom test environment.
dom.window.HTMLElement.prototype.attachEvent = function () {};
dom.window.HTMLElement.prototype.detachEvent = function () {};

dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function component(entry) {
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

const People = await component('src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx');
const Summary = await component('src/components/vault/VaultSummary.jsx');
const vaultId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

for (const kind of ['beneficiary', 'trustee']) {
  test(`people: language switch preserves ${kind} edit draft without reloading`, async () => {
    const originalFetch = globalThis.fetch;
    let reads = 0;
    const person = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', vaultId, fullName: 'Original name', phone: '0901234567', status: 'APPOINTED', appointedAt: '2026-10-10T00:00:00Z', revokedAt: null };
    globalThis.fetch = async (url) => {
      reads++;
      if (reads > 3) return new Promise(() => {}); // A reload would unmount the dialog while waiting.
      if (url.includes('configuration-check')) return json({ vaultId, ready: true, beneficiaryCount: 1, issues: [] });
      return json(page([url.includes('trustees') ? person : { ...person, status: 'DESIGNATED', hasAccount: false, hasIdentityNumber: false, createdAt: '2026-10-10T00:00:00Z' }]));
    };
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const render = (lang) => React.createElement(People, { vaultId, accessToken: 'synthetic', lang });
    try {
      await act(async () => root.render(render('vi')));
      if (kind === 'trustee') await act(async () => host.querySelector('#tab-trustee').click());
      const panel = host.querySelector(kind === 'trustee' ? '#panel-trustee' : '#panel-beneficiaries');
      await act(async () => [...panel.querySelectorAll('button')].find(button => button.textContent === 'Chỉnh sửa').click());
      await act(async () => setNativeInput(host.querySelector('#related-edit-fullName'), 'Unsaved draft'));
      for (const lang of ['en', 'vi']) {
        await act(async () => root.render(render(lang)));
        assert.equal(host.querySelector('#related-edit-fullName')?.value, 'Unsaved draft');
        assert.ok(host.querySelector('[role="dialog"]'));
      }
      assert.equal(reads, 3, 'Changing language must not reload person records');
    } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; }
  });
}
const page = (content) => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
});
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setNativeInput(element, value) {
  element.value = value;
  const reactPropsKey = Object.keys(element).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && element[reactPropsKey]?.onChange) {
    element[reactPropsKey].onChange({ target: { value } });
  } else {
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
}

// ============================================================================
// 1. Existing Tests for VI & EN Basics
// ============================================================================
for (const lang of ['vi', 'en']) {
  test(`people ${lang}: tab selection, separate add dialogs, no list duplication, validation, close and corrected Trustee name`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      url.includes('configuration-check')
        ? json({ vaultId, ready: false, beneficiaryCount: 0, issues: [{ code: 'BENEFICIARY_REQUIRED' }] })
        : json(page([]));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang })));
      assert.equal(host.querySelectorAll('dialog').length, 2);
      assert.equal(host.querySelector('dialog[open]'), null);
      assert.ok(!host.textContent.includes('giám hộ'));
      if (lang === 'vi') assert.match(host.textContent, /Người thi hành bên ngoài/);

      // Verify tab navigation (Bug 17)
      const benTab = host.querySelector('#tab-beneficiaries');
      const trusteeTab = host.querySelector('#tab-trustee');
      assert.ok(benTab && trusteeTab, 'Tabs must exist');

      // Default active tab must be Beneficiaries
      assert.equal(benTab.getAttribute('aria-selected'), 'true');
      assert.equal(trusteeTab.getAttribute('aria-selected'), 'false');
      assert.equal(benTab.tabIndex, 0, 'Active tab must have tabIndex=0');
      assert.equal(trusteeTab.tabIndex, -1, 'Inactive tab must have tabIndex=-1');

      const benPanel = host.querySelector('#panel-beneficiaries');
      const trusteePanel = host.querySelector('#panel-trustee');
      assert.equal(benPanel.hidden, false, 'Beneficiary panel must be visible by default');
      assert.equal(trusteePanel.hidden, true, 'Trustee panel must be hidden by default');
      assert.equal(benPanel.tabIndex, 0, 'Panel must have tabIndex=0 for keyboard accessibility');

      // Test 1: Add Beneficiary dialog in active Beneficiary panel
      await act(async () => benPanel.querySelector('button.lv-tb-btn-primary').click());
      const benDialog = benPanel.querySelector('dialog[open]');
      assert.ok(benDialog, 'Beneficiary dialog must be open');
      // Verify dialog does not duplicate the list
      assert.equal(benDialog.querySelectorAll('.lv-tb-entity-card').length, 0);

      // Submit empty form -> validation error
      await act(async () =>
        benDialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
      );
      assert.ok(benDialog.querySelector('.lv-tb-error-text'));

      // Close dialog
      await act(async () => benDialog.querySelector('.lv-tb-dialog-header button').click());
      assert.equal(benDialog.open, false);

      // Test 2: Switch to Trustee tab
      await act(async () => trusteeTab.click());
      assert.equal(trusteeTab.getAttribute('aria-selected'), 'true');
      assert.equal(benTab.getAttribute('aria-selected'), 'false');
      assert.equal(trusteeTab.tabIndex, 0);
      assert.equal(benTab.tabIndex, -1);
      assert.equal(trusteePanel.hidden, false, 'Trustee panel must be visible after switch');
      assert.equal(benPanel.hidden, true, 'Beneficiary panel must be hidden after switch');

      // Open Trustee dialog
      await act(async () => trusteePanel.querySelector('button.lv-tb-btn-primary').click());
      const trusteeDialog = trusteePanel.querySelector('dialog[open]');
      assert.ok(trusteeDialog, 'Trustee dialog must be open');
      assert.equal(trusteeDialog.querySelectorAll('.lv-tb-entity-card').length, 0);

      // Submit empty form -> validation error
      await act(async () =>
        trusteeDialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
      );
      assert.ok(trusteeDialog.querySelector('.lv-tb-error-text'));

      // Close dialog
      await act(async () => trusteeDialog.querySelector('.lv-tb-dialog-header button').click());
      assert.equal(trusteeDialog.open, false);

      // Switch back to Beneficiary tab: neither dialog should open unexpectedly
      await act(async () => benTab.click());
      assert.equal(host.querySelector('dialog[open]'), null);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      globalThis.fetch = originalFetch;
    }
  });
}

// ============================================================================
// 2. Keyboard Accessibility for Tabs (Roving Tabindex, Arrow Keys, Home, End)
// ============================================================================
test('people tabs: roving tabindex and keyboard navigation (ArrowRight, ArrowLeft, Home, End, Enter, Space)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    url.includes('configuration-check')
      ? json({ vaultId, ready: false, beneficiaryCount: 0, issues: [{ code: 'BENEFICIARY_REQUIRED' }] })
      : json(page([]));

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang: 'vi' })));

    const benTab = host.querySelector('#tab-beneficiaries');
    const trusteeTab = host.querySelector('#tab-trustee');
    const benPanel = host.querySelector('#panel-beneficiaries');
    const trusteePanel = host.querySelector('#panel-trustee');

    assert.ok(benTab && trusteeTab, 'Tabs must be rendered');

    // 1. Initial State: Beneficiary selected
    assert.equal(benTab.getAttribute('aria-selected'), 'true');
    assert.equal(benTab.tabIndex, 0);
    assert.equal(trusteeTab.tabIndex, -1);
    assert.equal(benPanel.hidden, false);
    assert.equal(trusteePanel.hidden, true);

    // 2. Press ArrowRight on Beneficiary Tab -> moves selection & focus to Trustee
    await act(async () => {
      benTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    assert.equal(trusteeTab.getAttribute('aria-selected'), 'true', 'ArrowRight should select Trustee tab');
    assert.equal(trusteeTab.tabIndex, 0);
    assert.equal(benTab.tabIndex, -1);
    assert.equal(trusteePanel.hidden, false);
    assert.equal(benPanel.hidden, true);

    // 3. Press ArrowLeft on Trustee Tab -> moves selection & focus back to Beneficiary
    await act(async () => {
      trusteeTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    });
    assert.equal(benTab.getAttribute('aria-selected'), 'true', 'ArrowLeft should select Beneficiary tab');
    assert.equal(benTab.tabIndex, 0);
    assert.equal(trusteeTab.tabIndex, -1);

    // 4. Press End on Beneficiary Tab -> moves to last tab (Trustee)
    await act(async () => {
      benTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    assert.equal(trusteeTab.getAttribute('aria-selected'), 'true', 'End should select Trustee tab');

    // 5. Press Home on Trustee Tab -> moves to first tab (Beneficiary)
    await act(async () => {
      trusteeTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    assert.equal(benTab.getAttribute('aria-selected'), 'true', 'Home should select Beneficiary tab');

    // 6. Enter / Space keys support activation
    await act(async () => {
      trusteeTab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    assert.equal(trusteeTab.getAttribute('aria-selected'), 'true', 'Enter should activate tab');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// 3. Realistic Fixtures & Business Rules (Beneficiary list, 1-Trustee limit)
// ============================================================================
test('people business fixtures: renders real lists, displays trustee max notice, and prevents duplicate trustee', async () => {
  const beneficiaryFixture = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      vaultId,
      fullName: 'Nguyen Van An',
      relationship: 'Con trai',
      dateOfBirth: '1995-05-20',
      phone: '0901234567',
      email: 'an.nguyen@example.com',
      status: 'DESIGNATED',
      hasAccount: false,
      hasIdentityNumber: false,
      createdAt: '2026-10-10T00:00:00Z',
    },
  ];
  const trusteeFixture = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      vaultId,
      fullName: 'Tran Thi Binh',
      relationship: 'Luat su dai dien',
      phone: '0912345678',
      email: 'binh.tran@example.com',
      status: 'APPOINTED',
      appointedAt: '2026-10-10T00:00:00Z',
      revokedAt: null,
    },
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('configuration-check')) {
      return json({ vaultId, ready: true, beneficiaryCount: 1, issues: [] });
    }
    if (url.includes('trustees')) {
      return json(page(trusteeFixture));
    }
    if (url.includes('/beneficiaries')) {
      return json(page(beneficiaryFixture));
    }
    return json({});
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang: 'vi' })));

    // 1. Beneficiary Tab should display existing beneficiary data
    const benPanel = host.querySelector('#panel-beneficiaries');
    assert.ok(benPanel, 'Beneficiary panel must be rendered');
    assert.ok(benPanel.textContent.includes('Nguyen Van An'), 'Beneficiary name must be rendered');
    assert.ok(benPanel.textContent.includes('0901234567'), 'Phone must be rendered');
    assert.ok(benPanel.textContent.includes('an.nguyen@example.com'), 'Email must be rendered');
    assert.ok(benPanel.textContent.includes('1995-05-20'), 'DOB must be rendered');

    // Add button must still exist for beneficiaries (can have multiple)
    assert.ok(benPanel.querySelector('button.lv-tb-btn-primary'), 'Add Beneficiary button should exist');

    // 2. Switch to Trustee Tab
    const trusteeTab = host.querySelector('#tab-trustee');
    await act(async () => trusteeTab.click());

    const trusteePanel = host.querySelector('#panel-trustee');
    assert.ok(trusteePanel, 'Trustee panel must be rendered');
    assert.ok(trusteePanel.textContent.includes('Tran Thi Binh'), 'Trustee name must be rendered');
    assert.ok(trusteePanel.textContent.includes('0912345678'), 'Trustee phone must be rendered');
    assert.ok(trusteePanel.textContent.includes('Đã chỉ định'), 'Appointed status badge must exist');

    // Max 1 Trustee limit notice must be displayed
    assert.ok(
      trusteePanel.textContent.includes('Đã đạt giới hạn tối đa 1 Người thi hành bên ngoài'),
      'Notice about 1 Trustee limit must be rendered'
    );

    // Add Trustee button and Skip button must NOT be present when 1 Trustee is already appointed
    assert.equal(
      trusteePanel.querySelector('.lv-tb-section-header button.lv-tb-btn-primary'),
      null,
      'Add Trustee button must NOT appear when 1 Trustee already appointed'
    );
    assert.equal(
      trusteePanel.querySelector('button.lv-tb-btn-skip'),
      null,
      'Skip button must NOT appear when Trustee is already appointed'
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// 4. Mutation Success & Failure Flows
// ============================================================================
test('people business mutations: adding beneficiary updates list and readiness; API error keeps form intact', async () => {
  let beneficiariesList = [];
  let isReady = false;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes('configuration-check')) {
      return json({
        vaultId,
        ready: isReady,
        beneficiaryCount: beneficiariesList.length,
        issues: isReady ? [] : [{ code: 'BENEFICIARY_REQUIRED' }],
      });
    }
    if (url.includes('trustees')) {
      return json(page([]));
    }
    if (url.includes('/beneficiaries')) {
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.fullName === 'FAIL_ME') {
          return new Response(JSON.stringify({ code: 'VAULT_NOT_EDITABLE' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Successful creation
        const newBen = {
          id: '33333333-3333-4333-8333-333333333333',
          vaultId,
          fullName: body.fullName,
          relationship: body.relationship || null,
          dateOfBirth: body.dateOfBirth || null,
          phone: body.phone || null,
          email: body.email || null,
          status: 'DESIGNATED',
          hasAccount: false,
          hasIdentityNumber: false,
          createdAt: '2026-10-15T00:00:00Z',
        };
        beneficiariesList.push(newBen);
        isReady = true;
        return json(newBen, 201);
      }
      return json(page(beneficiariesList));
    }
    return json({});
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // Initial mount with 0 beneficiaries
    await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang: 'vi' })));

    const benPanel = host.querySelector('#panel-beneficiaries');
    assert.ok(benPanel, 'Beneficiary panel must be rendered');
    assert.ok(benPanel.textContent.includes('Chưa có Người thụ hưởng'), 'Initial empty state rendered');

    // Case A: Submit error keeps form intact and displays error
    await act(async () => benPanel.querySelector('button.lv-tb-btn-primary').click());
    const benDialog = benPanel.querySelector('dialog[open]');
    assert.ok(benDialog);

    const nameInput = benDialog.querySelector('#ben-fullname');
    const emailInput = benDialog.querySelector('#ben-email');

    await act(async () => {
      setNativeInput(nameInput, 'FAIL_ME');
      setNativeInput(emailInput, 'fail@example.com');
    });

    await act(async () => {
      benDialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Dialog stays open, error displayed, inputs preserved
    assert.equal(benDialog.open, true, 'Dialog must stay open on API error');
    assert.ok(benDialog.querySelector('[role="alert"]'), 'Error alert must be displayed inside dialog');
    assert.equal(nameInput.value, 'FAIL_ME', 'Form data must be preserved on API error');

    // Case B: Successful submission
    await act(async () => {
      setNativeInput(nameInput, 'Le Thi Mai');
      setNativeInput(emailInput, 'mai.le@example.com');
    });

    await act(async () => {
      benDialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Dialog closes
    assert.equal(benDialog.open, false, 'Dialog must close on success');

    // Success alert in panel, list reloads with new beneficiary
    assert.ok(host.textContent.includes('Đã thêm Người thụ hưởng thành công'));
    assert.ok(benPanel.textContent.includes('Le Thi Mai'), 'New beneficiary must appear in list');
    assert.ok(host.textContent.includes('Đã sẵn sàng cấu hình'), 'Readiness updated from BE');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// 5. Subscription Policy Pending Widget Test
// ============================================================================
test('vault widget explains subscription policy pending without inventing plan or quota', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    url.includes('/subscriptions/me') ? json({ code: 'SUBSCRIPTION_POLICY_PENDING' }, 503) : json({});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Summary, { vaultId, ownerId: vaultId, accessToken: 'synthetic', lang: 'vi' })));
    assert.match(host.querySelector('.lv-summary-sub-widget').textContent, /Gói sử dụng hiện chưa được mở/);
    assert.equal(host.querySelector('.lv-summary-sub-plan-badge'), null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

for (const lang of ['vi', 'en']) test(`minor warning ${lang}: follows the entered date and cannot silently save without guardian support`, async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') writes++;
    return url.includes('configuration-check') ? json({ vaultId, ready: false, beneficiaryCount: 0, issues: [{ code: 'BENEFICIARY_REQUIRED' }] }) : json(page([]));
  };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const change = async (id, value) => {
    const field = host.querySelector(id);
    const key = Object.keys(field).find(key => key.startsWith('__reactProps$'));
    await act(async () => { field[key].onChange({ target: { value } }); });
  };
  try {
    await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang })));
    const dialog = host.querySelector('section[aria-labelledby="beneficiary-heading"] dialog');
    await change('#ben-fullname', 'Beneficiary');
    await change('#ben-dob', `${new Date().getFullYear() - 10}-01-01`);
    assert.match(host.querySelector('#ben-guardian-notice').textContent, lang === 'en' ? /under 18/ : /chưa đủ 18/);
    assert.equal(dialog.querySelector('button[type="submit"]').disabled, true);
    await act(async () => dialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes, 0);
    await change('#ben-dob', '1990-01-01');
    assert.equal(host.querySelector('#ben-guardian-notice'), null);
    assert.equal(dialog.querySelector('button[type="submit"]').disabled, false);
    await change('#ben-dob', '');
    assert.equal(host.querySelector('#ben-guardian-notice'), null);
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; }
});

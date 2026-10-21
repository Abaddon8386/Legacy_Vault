import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { updateProfile } from '../services/profileService.js';
import { readUser } from '../api/contracts.js';
import { storeSession, readStoredSession } from './session.js';
import { validateProfileEditForm } from './accountEditValidation.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/edit?lang=en' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
const user = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Profile Test', email: 'profile@example.test', phoneNumber: '+84901234567', roles: ['VAULT_OWNER'] };
const session = () => ({ user, accessToken: 'synthetic-profile-token', expiresAt: Date.now() + 600000 });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fetchFn, action) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try { await action(); } finally { globalThis.fetch = previous; storeSession(null); }
}
async function component(entry) {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const App = await component('src/App.jsx');
const Page = await component('src/pages/account/AccountEditPage.jsx');
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, render: async next => { await act(async () => root.render(React.createElement(Component, next))); },
    close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function change(host, id, value) {
  const field = host.querySelector('#' + id);
  const key = Object.keys(field).find(item => item.startsWith('__reactProps$'));
  await act(async () => field[key].onChange({ target: { value } }));
}
async function submit(host) { await act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }

test('profile service sends authenticated PATCH and validates same-user response, phone and status', async () => {
  const saved = session(), controller = new AbortController();
  await withFetch(async (url, options) => {
    assert.equal(url, '/api/v1/auth/me'); assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.Authorization, `Bearer ${saved.accessToken}`);
    assert.equal(options.headers['Accept-Language'], 'en'); assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), { fullName: 'Saved Name', phoneNumber: '' });
    return json({ ...user, fullName: 'Saved Name', phoneNumber: null, passwordHash: 'never-copy' });
  }, async () => {
    const result = await updateProfile(saved, { fullName: 'Saved Name', phoneNumber: '' }, { lang: 'en', signal: controller.signal });
    assert.equal(result.phoneNumber, null); assert.equal(result.passwordHash, undefined);
  });
  for (const raw of [{ ...user, id: '22222222-2222-4222-8222-222222222222' }, { ...user, phoneNumber: 12 }, { id: user.id }]) {
    await withFetch(async () => json(raw), async () => assert.rejects(updateProfile(saved, { fullName: 'Name' })));
  }
  for (const changes of [{ roles: ['ADMIN'] }, { id: user.id }, {}, { status: 'ACTIVE' }, { password: 'new-secret' }]) {
    await assert.rejects(updateProfile(saved, changes), { code: 'INVALID_PROFILE_PATCH' });
  }
  await assert.rejects(updateProfile({ ...saved, expiresAt: 0 }, { fullName: 'Name' }), { code: 'UNAUTHENTICATED' });
});

test('profile service preserves HTTP failures and does not accept an unexpected success status', async () => {
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [401, 'UNAUTHENTICATED'], [403, 'ACCESS_DENIED'], [409, 'EMAIL_ALREADY_EXISTS'], [429, 'TOO_MANY_ATTEMPTS'], [503, 'INTERNAL_ERROR']]) {
    await withFetch(async () => json({ code }, status), async () => assert.rejects(updateProfile(session(), {fullName:'Name'}), error => error.status === status && error.code === code));
  }
  await withFetch(async () => json(user, 201), async () => assert.rejects(updateProfile(session(), { fullName: 'Name' }), { code: 'INVALID_RESPONSE' }));
});

test('profile validation follows name/phone bounds; phone is whitelisted into session data', () => {
  for (const fullName of [' ', 'a'.repeat(151), 'A\nB']) assert.equal(validateProfileEditForm({fullName}).isValid, false);
  for (const phoneNumber of ['123', 'a12345678', '+1234567890123456']) assert.equal(validateProfileEditForm({fullName:'Name',phoneNumber}).isValid, false);
  assert.equal(validateProfileEditForm({fullName:' Name ',phoneNumber:''}).isValid, true);
  assert.equal(readUser({...user,passwordHash:'private'}).phoneNumber, user.phoneNumber);
  assert.equal(readUser({...user,passwordHash:'private'}).passwordHash, undefined);
});

for (const role of ['VAULT_OWNER','STAFF_EXECUTOR','LEGAL_VERIFIER','ADMIN','BENEFICIARY']) {
  test(`actual App ${role}: saves name/phone, clears dirty state, updates tab session and retains token expiry`, async () => {
    const saved = { ...session(), user: { ...user, roles: [role] } };
    const calls = [];
    await withFetch(async (url, options) => {
      calls.push({ url, options });
      assert.equal(url, '/api/v1/auth/me');
      return json(options.method === 'PATCH' ? { ...saved.user, fullName: 'Saved Name', phoneNumber: null } : saved.user);
    }, async () => {
      storeSession(saved); window.history.replaceState({}, '', '/account/edit?lang=en');
      const view = await mount(App, {});
      try {
        assert.equal(view.host.querySelector('#lv-edit-phone').value, saved.user.phoneNumber);
        assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
        await change(view.host,'lv-edit-fullname',' Saved Name '); await change(view.host,'lv-edit-phone',''); await submit(view.host);
        const writes = calls.filter(item => item.options.method === 'PATCH');
        assert.equal(writes.length, 1); assert.deepEqual(JSON.parse(writes[0].options.body), {fullName:'Saved Name',phoneNumber:''});
        assert.match(view.host.textContent,/Profile updated/); assert.equal(view.host.querySelector('.lv-unsaved-pill'),null);
        const stored = readStoredSession(); assert.equal(stored.user.fullName,'Saved Name'); assert.equal(stored.user.phoneNumber,null);
        assert.equal(stored.accessToken,saved.accessToken); assert.equal(stored.expiresAt,saved.expiresAt);
        assert.equal(view.host.querySelector('button[type=submit]').disabled,true);
      } finally { await view.close(); }
    });
  });
}

test('forbidden save locks subsequent submissions; HTTP 401 calls session invalidation', async () => {
  let calls = 0, unauthorized = 0;
  const props = {session:session(),lang:'en',saveProfile:async()=>{calls++;throw {status:403};},onUnauthorized:()=>unauthorized++};
  const view = await mount(Page,props);
  try {
    await change(view.host,'lv-edit-fullname','Draft'); await submit(view.host); await submit(view.host);
    assert.equal(calls,1); assert.equal(view.host.querySelector('button[type=submit]').disabled,true);
    assert.equal(view.host.querySelector('#lv-edit-fullname').disabled,true);
    assert.match(view.host.textContent,/Reload the page/);
    await view.render({...props,session:{...props.session,accessToken:'new-token'},saveProfile:async()=>{throw {status:401};}});
    await submit(view.host); assert.equal(unauthorized,1);
  } finally {await view.close();}
});

test('phone drafts survive refresh but account switches clear them; pending saves carry locale and abort on token switch', async () => {
  let finish, options;
  const props={session:session(),lang:'en',saveProfile:(_changes,config)=>{options=config;return new Promise(resolve=>{finish=resolve;});}};
  const view=await mount(Page,props);
  try {
    await change(view.host,'lv-edit-phone','0901234567');
    await view.render({...props,session:{...props.session,user:{...user,phoneNumber:'0909999999'}}});
    assert.equal(view.host.querySelector('#lv-edit-phone').value,'0901234567');
    await submit(view.host); assert.equal(options.lang,'en');
    await view.render({...props,session:{...props.session,accessToken:'new-token'}}); assert.equal(options.signal.aborted,true);
    await act(async()=>finish({...user,phoneNumber:'0901234567'})); assert.doesNotMatch(view.host.textContent,/Profile updated/);
    await view.render({...props,session:{...props.session,user:{...user,id:'22222222-2222-4222-8222-222222222222',phoneNumber:null}}});
    assert.equal(view.host.querySelector('#lv-edit-phone').value,'');
  } finally {await view.close();}
});

test('actual App logout during PATCH aborts the write and a late receipt never restores the session', async () => {
  let finish, pendingSignal;
  await withFetch(async (_url, options) => {
    if (options.method === 'PATCH') {pendingSignal=options.signal; return new Promise(resolve=>{finish=resolve;});}
    return json(user);
  }, async () => {
    storeSession(session());window.history.replaceState({},'', '/account/edit?lang=en');
    const view=await mount(App,{});
    try {
      await change(view.host,'lv-edit-fullname','Pending name');await submit(view.host);
      await act(async()=>view.host.querySelector('[aria-label="Account options"]').click());
      await act(async()=>view.host.querySelector('.lv-account-menu-item--logout').click());
      assert.equal(pendingSignal.aborted,true);assert.equal(readStoredSession(),null);
      await act(async()=>finish(json({...user,fullName:'Late receipt'})));
      assert.equal(readStoredSession(),null);assert.equal(window.location.pathname,'/login');
    } finally {await view.close();}
  });
});

test('actual App aborts pre-save refresh and discards its late response rather than replacing a saved profile', async () => {
  let finishRefresh, refreshSignal, reads=0;
  await withFetch(async (_url, options) => {
    if(options.method==='PATCH') return json({...user,fullName:'Saved after refresh'});
    reads++;
    if(reads===2){refreshSignal=options.signal;return new Promise(resolve=>{finishRefresh=resolve;});}
    return json(user);
  },async()=>{
    storeSession(session());window.history.replaceState({},'','/account/edit?lang=en');
    const view=await mount(App,{});
    try {
      await act(async()=>view.host.querySelector('.lv-header-action-btn[title*="Refresh"]').click());
      await change(view.host,'lv-edit-fullname','Saved after refresh');await submit(view.host);
      assert.equal(refreshSignal.aborted,true);
      await act(async()=>finishRefresh(json({...user,fullName:'Stale refresh'})));
      assert.equal(readStoredSession().user.fullName,'Saved after refresh');
      assert.equal(view.host.querySelector('#lv-edit-fullname').value,'Saved after refresh');
    }finally{await view.close();}
  });
});

test('unsaved-change dialog traps keyboard focus; Escape keeps the draft and restores Cancel focus',async()=>{
  let cancelled=0;
  const view=await mount(Page,{session:session(),lang:'en',onCancel:()=>cancelled++});
  try{
    await change(view.host,'lv-edit-fullname','Unsaved draft');
    const cancel=[...view.host.querySelectorAll('button')].find(button=>button.textContent==='Cancel');
    cancel.focus();await act(async()=>cancel.click());
    const dialog=view.host.querySelector('[role=dialog]');assert.ok(dialog);
    const buttons=dialog.querySelectorAll('button');assert.equal(document.activeElement,buttons[0]);
    buttons[buttons.length-1].focus();
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',cancelable:true})));
    assert.equal(document.activeElement,buttons[0]);
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',cancelable:true})));
    assert.equal(view.host.querySelector('[role=dialog]'),null);assert.equal(cancelled,0);
    assert.equal(view.host.querySelector('#lv-edit-fullname').value,'Unsaved draft');assert.equal(document.activeElement,cancel);
  }finally{await view.close();}
});

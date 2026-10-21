import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/profile' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent=()=>{};
dom.window.HTMLElement.prototype.detachEvent=()=>{};
async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { output: { codeSplitting: false }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return { exports: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')), code };
}


const { exports: { default: EditProfile } } = await loadComponentModule('src/pages/account/AccountEditPage.jsx');
const profile = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Test User', email: 'test@example.test', roles: ['VAULT_OWNER'] };
const session = { accessToken: 'test-token', expiresAt: Date.now() + 600000, user: profile };
test('without a save handler the profile never invents a successful save', async () => {
 const view=await mount(EditProfile,{session,lang:'en'});
 try {
  await change(view.host,'lv-edit-fullname','Changed name');
  assert.equal(view.host.querySelector('button[type="submit"]').disabled,true);
  await submit(view.host);
  assert.doesNotMatch(view.host.textContent,/Profile updated|Information updated/);
  assert.equal(session.user.fullName,'Test User');
 } finally { await view.close(); }
});
async function mount(Component,props){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,render:async next=>{await act(async()=>root.render(React.createElement(Component,next)));},close:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function change(host,id,value){const field=host.querySelector('#'+id);assert.ok(field,id);const key=Object.keys(field).find(k=>k.startsWith('__reactProps$'));await act(async()=>{field[key].onChange({target:{value}});});}
async function submit(host){await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
test('Bug 14: saving through the supplied handler updates displayed profile without changing real session or storage',async()=>{
 const storageBefore=window.sessionStorage.length;let count=0;
 function Harness(){const [user,setUser]=React.useState(profile);return React.createElement('div',null,React.createElement('output',null,user.fullName),React.createElement(EditProfile,{session:{...session,user},lang:'en',saveProfile:async changes=>{count++;return {...user,...changes};},onProfileSaved:setUser}));}
 const view=await mount(Harness,{});try{await change(view.host,'lv-edit-fullname','Changed demo name');await submit(view.host);assert.equal(count,1);assert.equal(view.host.querySelector('output').textContent,'Changed demo name');assert.equal(view.host.querySelector('.lv-unsaved-pill'),null);assert.equal(window.sessionStorage.length,storageBefore);assert.equal(profile.fullName,'Test User');}finally{await view.close();}
});

test('Bug 14: save failure keeps input; late result after switching account is discarded',async()=>{
 let mode='error',finish,calls=0;const saved=[];
 const props={session,lang:'en',saveProfile:async()=>{calls++;if(mode==='error')throw Error('offline');return new Promise(resolve=>{finish=resolve;});},onProfileSaved:user=>saved.push(user)};
 const view=await mount(EditProfile,props);try{await change(view.host,'lv-edit-fullname','Unsaved name');await submit(view.host);assert.equal(view.host.querySelector('#lv-edit-fullname').value,'Unsaved name');assert.ok(view.host.querySelector('[role=alert]'));
 mode='pending';await submit(view.host);await submit(view.host);assert.equal(calls,2);
 const next={...profile,id:'33333333-3333-4333-8333-333333333333',fullName:'Other account'};await view.render({...props,session:{...session,user:next}});await act(async()=>finish({...profile,fullName:'Stale name'}));assert.equal(saved.length,0);assert.equal(view.host.querySelector('#lv-edit-fullname').value,'Other account');
 }finally{await view.close();}
});


test('profile save discards previous-token response and permits retry for the same user', async () => {
  let complete, signal; const saved=[];
  const props={session,lang:'en',saveProfile:(_changes,options)=>{signal=options.signal;return new Promise(resolve=>{complete=resolve;});},onProfileSaved:user=>saved.push(user)};
  const view=await mount(EditProfile,props);
  try {
    await change(view.host,'lv-edit-fullname','Draft name');await submit(view.host);
    await view.render({...props,session:{...session,accessToken:'new-token'}});
    assert.equal(signal.aborted,true);
    await act(async()=>complete({...profile,fullName:'Old receipt'}));
    assert.equal(saved.length,0);assert.equal(view.host.querySelector('#lv-edit-fullname').value,'Draft name');
    assert.equal(view.host.querySelector('button[type="submit"]').disabled,false);
  } finally {await view.close();}
});

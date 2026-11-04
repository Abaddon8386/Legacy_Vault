import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import {resolve} from 'node:path';
const dom=new JSDOM('<body></body>',{url:'http://localhost/account',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const entries={
  Provider:['default','src/components/auth/PasswordSetupProvider.jsx'], Google:['default','src/components/auth/GoogleSignInButton.jsx'],
  Modal:['Modal','src/components/common/Modal.jsx'], Account:['default','src/pages/account/AccountEditPage.jsx'],
  passwordRequest:['passwordRequest','src/api/passwordRequest.js'], requestFirstPassword:['requestFirstPassword','src/utils/passwordSetupFlow.js'],
  updateProfile:['updateProfile','src/services/profileService.js'],
};
const virtual='password-setup-fixture.js';
const built=await build({configFile:false,logLevel:'silent',define:{'import.meta.env.VITE_GOOGLE_CLIENT_ID':'"test.apps.googleusercontent.com"'},
  plugins:[{name:'password-setup-test',resolveId:id=>id.endsWith(virtual)?'\0'+virtual:null,load:id=>id==='\0'+virtual?Object.entries(entries).map(([name,[exported,path]])=>`export {${exported} as ${name}} from ${JSON.stringify(resolve(path).replaceAll('\\','/'))};`).join('\n'):null}],
  build:{write:false,minify:false,lib:{entry:virtual,formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const {Provider,Google,Modal,Account,passwordRequest,requestFirstPassword,updateProfile}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const id='11111111-1111-4111-8111-111111111111';
const user={id,fullName:'Google Owner',email:'owner@example.com',phoneNumber:null,roles:['VAULT_OWNER'],passwordLoginEnabled:false};
const session={accessToken:'test-only',expiresAt:Date.now()+3600000,user};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const original=globalThis.fetch;
let google;
test.beforeEach(()=>{window.google={accounts:{id:{initialize:value=>{google=value;},renderButton(){}}}};});
test.afterEach(()=>{globalThis.fetch=original;delete window.google;});
const props=node=>node[Object.keys(node).find(x=>x.startsWith('__reactProps$'))];
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
async function mount(children=React.createElement('input',{'data-draft':true,defaultValue:'Unsaved draft'})) {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const render=async(value=session)=>act(async()=>root.render(React.createElement(Provider,{session:value},children)));
  await render();return{host,render,close:async()=>{await act(async()=>root.unmount());host.remove();}};
}
const dialog=view=>view.host.querySelector('.lv-password-setup [role=dialog]');
async function fill(view) {
  const inputs=dialog(view).querySelectorAll('input');
  await act(async()=>{props(inputs[0]).onChange({target:{value:'First-password-123'}});props(inputs[1]).onChange({target:{value:'First-password-123'}});});
}
async function submit(view) {await act(async()=>props(dialog(view).querySelector('form')).onSubmit({preventDefault(){}}));await tick();}
async function start(view,lang='vi') {
  let operation;
  await act(async()=>{operation=passwordRequest('/protected-action',{accessToken:'test-only',lang,method:'PATCH',body:{password:'old',name:'Kept draft'},expectedStatus:200});});
  operation.catch(()=>{});await tick();assert.ok(dialog(view));return{operation};
}
for(const lang of ['vi','en']) test(`setup needs a fresh Google credential, handles wrong Google identity and resumes the same draft (${lang})`,async()=>{
  const calls=[];let protectedCalls=0,setupCalls=0;
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});if(url.endsWith('/auth/me'))return json(user);
    if(url.endsWith('/auth/password/setup')){setupCalls++;return setupCalls===1?json({code:'GOOGLE_IDENTITY_MISMATCH'},403):json({passwordLoginEnabled:true});}
    protectedCalls++;return protectedCalls===1?json({code:'PASSWORD_NOT_SET'},403):json({saved:true});
  };
  const view=await mount();try {
    const {operation}=await start(view,lang);await fill(view);
    assert.equal(dialog(view).querySelector('button[type=submit]').disabled,true);
    await act(async()=>google.callback({credential:'wrong-google'}));await submit(view);
    assert.match(dialog(view).textContent,lang==='en'?/Choose the Google account/:/chọn đúng tài khoản Google/);
    assert.equal(dialog(view).querySelector('input').value,'First-password-123');
    assert.equal(dialog(view).querySelector('button[type=submit]').disabled,true,'a failed attempt requires a new Google callback');
    await act(async()=>google.callback({credential:'fresh-linked-google'}));await submit(view);
    assert.deepEqual(await operation,{saved:true});assert.equal(dialog(view),null);
    const setup=calls.filter(x=>x.url.endsWith('/auth/password/setup'));
    assert.deepEqual(JSON.parse(setup[1].init.body),{password:'First-password-123',credential:'fresh-linked-google'});
    assert.equal(setup[1].init.headers.Authorization,'Bearer test-only');
    assert.deepEqual(JSON.parse(calls.at(-1).init.body),{password:'First-password-123',name:'Kept draft'});
    assert.equal(view.host.querySelector('[data-draft]').value,'Unsaved draft');
    assert.equal(window.sessionStorage.length,0);
  } finally {await view.close();}
});

test('Escape only closes setup, preserves the underlying modal and restores its Google callback',async()=>{
  let underlyingClosed=0,googleCalls=0;
  globalThis.fetch=async()=>json(user);
  const children=React.createElement(Modal,{isOpen:true,onClose:()=>underlyingClosed++,title:'Edit asset'},
    React.createElement('input',{'data-draft':true,defaultValue:'Keep me'}),React.createElement(Google,{onCredentialReceived:()=>googleCalls++}));
  const view=await mount(children);try {
    const underlyingGoogle=google;
    let pending;await act(async()=>{pending=requestFirstPassword({accessToken:'test-only',lang:'en'});});pending.catch(()=>{});await tick();
    assert.notEqual(google,underlyingGoogle);
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await assert.rejects(pending,{code:'PASSWORD_SETUP_CANCELLED'});assert.equal(underlyingClosed,0);assert.equal(dialog(view),null);
    assert.equal(view.host.querySelector('[data-draft]').value,'Keep me');assert.equal(google,underlyingGoogle);
    await act(async()=>google.callback({credential:'fresh-link'}));assert.equal(googleCalls,1);
  } finally {await view.close();}
});

test('switching accounts during setup aborts the pending POST and cannot retry the old action',async()=>{
  let finish,signal,protectedCalls=0;
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/me'))return json(user);
    if(url.endsWith('/auth/password/setup')){signal=init.signal;return new Promise(resolve=>{finish=resolve;});}
    protectedCalls++;return json({code:'PASSWORD_NOT_SET'},403);
  };
  const view=await mount();try {
    const {operation}=await start(view);await fill(view);await act(async()=>google.callback({credential:'fresh'}));
    await act(async()=>{props(dialog(view).querySelector('form')).onSubmit({preventDefault(){}});});await tick();
    await view.render({...session,accessToken:'different-account'});assert.equal(signal.aborted,true);
    await act(async()=>finish(json({passwordLoginEnabled:true})));await assert.rejects(operation,{name:'AbortError'});
    assert.equal(protectedCalls,1);assert.equal(dialog(view),null);assert.doesNotMatch(view.host.textContent,/First-password/);
  } finally {await view.close();}
});

test('Google-only email edits set a password before requiring current-password proof and keep the entered email',async()=>{
  const calls=[];let saved;
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});if(init.method==='GET')return json(user);
    if(url.endsWith('/password/setup'))return json({passwordLoginEnabled:true});
    return json({...user,email:'changed@example.com',passwordLoginEnabled:true});
  };
  const view=await mount(React.createElement(Account,{session,lang:'en',saveProfile:(changes,options)=>updateProfile(session,changes,options),onProfileSaved:value=>{saved=value;}}));
  try {
    await act(async()=>props(view.host.querySelector('#lv-edit-email')).onChange({target:{value:'changed@example.com'}}));
    assert.equal(view.host.querySelector('#lv-edit-current-password'),null);
    await act(async()=>{props(view.host.querySelector('form')).onSubmit({preventDefault(){}});});await tick();
    await fill(view);await act(async()=>google.callback({credential:'fresh'}));await submit(view);await tick();
    assert.equal(saved.email,'changed@example.com');
    assert.deepEqual(calls.filter(x=>x.init.method==='POST').map(x=>x.url),['/api/v1/auth/password/setup']);
    assert.deepEqual(JSON.parse(calls.find(x=>x.init.method==='PATCH').init.body),{email:'changed@example.com',currentPassword:'First-password-123'});
  } finally {await view.close();}
});

test('an already-set or unreadable password capability never enables the setup submit action',async()=>{
  for(const response of [{...user,passwordLoginEnabled:true},{...user,passwordLoginEnabled:'false'}]) {
    globalThis.fetch=async()=>json(response);const view=await mount();try {
      let pending;await act(async()=>{pending=requestFirstPassword({accessToken:'test-only'});});pending.catch(()=>{});await tick();
      assert.ok(dialog(view).querySelector('[role=alert]'));assert.equal(dialog(view).querySelector('button[type=submit]').disabled,true);
      await act(async()=>view.host.querySelector('.lv-password-setup button[type=button]').click());await assert.rejects(pending,{code:'PASSWORD_SETUP_CANCELLED'});
    } finally {await view.close();}
  }
});

test('a setup timeout keeps the draft, requires fresh Google confirmation and does not replay the protected action',async()=>{
  const realTimeout=globalThis.setTimeout;let protectedCalls=0;
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/me'))return json(user);
    if(url.endsWith('/auth/password/setup'))return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
    protectedCalls++;return json({code:'PASSWORD_NOT_SET'},403);
  };
  const view=await mount();try {
    const {operation}=await start(view);await fill(view);await act(async()=>google.callback({credential:'fresh'}));
    globalThis.setTimeout=(fn,ms,...args)=>realTimeout(fn,ms===20000?0:ms,...args);
    await submit(view);assert.ok(dialog(view).querySelector('[role=alert]'));
    assert.equal(dialog(view).querySelector('input').value,'First-password-123');
    assert.equal(dialog(view).querySelector('button[type=submit]').disabled,true);assert.equal(protectedCalls,1);
    await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await assert.rejects(operation,{code:'PASSWORD_SETUP_CANCELLED'});
  } finally {globalThis.setTimeout=realTimeout;await view.close();}
});

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
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
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


const { DownloadReauthModal } = await loadComponentModule('src/pages/wills/WillUploadPage.jsx');
const props = { lang: 'en', t: { errors: { DOWNLOAD_FAILED: 'Unable to view', REAUTH_FAILED: 'Wrong password' }, passwordLabel: 'Password', cancel: 'Cancel', confirmViewBtn: 'View', reauthModalTitleView: 'Verify password' }, vaultId: '11111111-1111-4111-8111-111111111111', willId: '22222222-2222-4222-8222-222222222222', version: 1, fileName: 'will.pdf', mode: 'view', accessToken: 'test-token', onClose() {} };
async function mount() {
 const host=document.createElement('section');host.className='hn-will-page';document.body.append(host);
 const root=createRoot(host);await act(async()=>root.render(React.createElement(DownloadReauthModal,props)));
 const input=host.querySelector('input');const key=Object.keys(input).find(k=>k.startsWith('__reactProps$'));
 await act(async()=>input[key].onChange({target:{value:'test-password'}}));
 return {host,root,submit:()=>act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))),close:async()=>{await act(async()=>root.unmount());host.remove();}};
}
for(const mime of ['image/png','application/pdf']) test(`Bug 13: ${mime} opens inside current dialog and is released on unmount`,async()=>{
 const oldFetch=globalThis.fetch, oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldOpen=window.open;
 const revoked=[];let received;
 URL.createObjectURL=()=> 'blob:test-will';URL.revokeObjectURL=url=>revoked.push(url);
 window.open=()=>assert.fail('Must not open another tab');
 globalThis.fetch=async(_url,options)=>{received=options;return {ok:true,status:200,headers:new Headers({'content-type':mime}),blob:async()=>new Blob(['test'],{type:mime})};};
 const view=await mount();try {
 await view.submit();assert.equal(JSON.parse(received.body).password,'test-password');
 const preview=view.host.querySelector(mime==='application/pdf'?'iframe':'img');assert.ok(preview);assert.equal(preview.getAttribute('src'),'blob:test-will');assert.equal(view.host.querySelector('input'),null);
 await view.close();assert.deepEqual(revoked,['blob:test-will']);
 }finally{if(view.host.isConnected)await view.close();globalThis.fetch=oldFetch;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;window.open=oldOpen;}
});
test('Bug 13: late file response after closing does not create a preview URL',async()=>{
 const oldFetch=globalThis.fetch,oldCreate=URL.createObjectURL;let finish,signal;let urls=0;
 globalThis.fetch=(_url,opts)=>{signal=opts.signal;return new Promise(resolve=>{finish=resolve;});};URL.createObjectURL=()=>{urls++;return 'blob:late';};
 const view=await mount();try{await view.submit();await view.close();assert.equal(signal.aborted,true);await act(async()=>finish({ok:true,status:200,headers:new Headers({'content-type':'application/pdf'}),blob:async()=>new Blob(['test'],{type:'application/pdf'})}));assert.equal(urls,0);}finally{if(view.host.isConnected)await view.close();globalThis.fetch=oldFetch;URL.createObjectURL=oldCreate;}
});

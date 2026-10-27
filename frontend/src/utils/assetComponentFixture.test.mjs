import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { assetService } from '../services/assetService.js';
import { ASSET_I18N } from '../pages/assets/assetI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup JSDOM environment for React component rendering tests
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/assets',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const summaryMod = await loadComponentModule('src/components/assets/AssetSummaryCards.jsx');
const AssetSummaryCards = summaryMod.AssetSummaryCards || summaryMod.default;

const tableMod = await loadComponentModule('src/components/assets/AssetListTable.jsx');
const AssetListTable = tableMod.AssetListTable || tableMod.default;

const pageMod = await loadComponentModule('src/pages/assets/AssetManagementPage.jsx');
const AssetManagementPage = pageMod.AssetManagementPage || pageMod.default;

const quotaFixture = (assetsUsed=5) => ({planCode:'BASIC',status:'ACTIVE',assetsUsed,maxAssets:5,storageUsedBytes:100,maxStorageBytes:104857600,vaultsCreatedLifetime:1,maxVaultsLifetime:1,expiresAt:null});
const quotaJson = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const emptyAssets = {page:0,size:10,totalElements:0,totalPages:0,content:[]};
test('Full quota includes wills, blocks both add controls, and links to plans',async()=>{
 const original=globalThis.fetch; let plans=0;
 globalThis.fetch=async url=>quotaJson(url.includes('/subscriptions/me')?quotaFixture():emptyAssets);
 const view=await mount(AssetManagementPage,{vaultId:'11111111-1111-4111-8111-111111111111',accessToken:'fixture',enforceQuota:true,onNavigateToSubscription:()=>plans++});
 try {
  assert.equal(view.container.querySelector('.lv-add-btn').disabled,true);
  assert.equal(view.container.querySelector('.lv-mobile-fab').disabled,true);
  assert.equal(view.container.querySelector('.lv-empty-card .lv-btn--primary').disabled,true);
  assert.match(view.container.querySelector('.lv-asset-quota-notice').textContent,/5\/5.*hồ sơ di chúc/);
  await act(async()=>view.container.querySelector('.lv-asset-quota-notice button').click());
  assert.equal(plans,1); assert.equal(view.container.querySelector('[role=dialog]'),null);
 }finally{await view.unmount();globalThis.fetch=original;}
});
test('Quota load failure blocks creation until a successful retry',async()=>{
 const original=globalThis.fetch; let reads=0;
 globalThis.fetch=async url=>url.includes('/subscriptions/me')?(++reads===1?quotaJson({code:'INTERNAL_ERROR'},503):quotaJson(quotaFixture(4))):quotaJson(emptyAssets);
 const view=await mount(AssetManagementPage,{vaultId:'11111111-1111-4111-8111-111111111111',accessToken:'fixture',enforceQuota:true});
 try {
  assert.equal(view.container.querySelector('.lv-add-btn').disabled,true);
  await act(async()=>view.container.querySelector('.lv-asset-quota-notice button').click());
  assert.equal(view.container.querySelector('.lv-add-btn').disabled,false);
  await act(async()=>view.container.querySelector('.lv-add-btn').click());
  assert.ok(view.container.querySelector('[role=dialog]'));
  await act(async()=>view.container.querySelector('.lv-modal__close-btn').click());
  assert.equal(view.container.querySelector('[role=dialog]'),null);
 }finally{await view.unmount();globalThis.fetch=original;}
});
test('Quota consumed in another tab is rechecked before posting an asset',async()=>{
 const original=globalThis.fetch; let reads=0,posts=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/subscriptions/me'))return quotaJson(quotaFixture(++reads===1?4:5));
  if(options.method==='POST'){posts++;throw new Error('Creation must be blocked');}
  return quotaJson(emptyAssets);
 };
 const view=await mount(AssetManagementPage,{vaultId:'11111111-1111-4111-8111-111111111111',accessToken:'fixture',enforceQuota:true});
 try {
  await act(async()=>view.container.querySelector('.lv-add-btn').click());
  for(const [id,value] of [['asset-name','New asset'],['asset-type','TEXT'],['asset-payload','synthetic']]) {
   const field=view.container.querySelector('#'+id),key=Object.keys(field).find(k=>k.startsWith('__reactProps'));
   await act(async()=>field[key].onChange({target:{value}}));
  }
  await act(async()=>view.container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(posts,0);assert.ok(reads>=2);
  assert.match(view.container.querySelector('[role=dialog] [role=alert]').textContent,/Đã hết chỗ/);
 }finally{await view.unmount();globalThis.fetch=original;}
});
test('A backend quota conflict after preflight keeps the draft and shows the specific reason',async()=>{
 const original=globalThis.fetch; let posts=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/subscriptions/me'))return quotaJson(quotaFixture(posts?5:4));
  if(options.method==='POST'){posts++;return quotaJson({code:'ASSET_QUOTA_EXCEEDED'},409);}
  return quotaJson(emptyAssets);
 };
 const view=await mount(AssetManagementPage,{vaultId:'11111111-1111-4111-8111-111111111111',accessToken:'fixture',enforceQuota:true});
 try {
  await act(async()=>view.container.querySelector('.lv-add-btn').click());
  for(const [id,value] of [['asset-name','Preserved draft'],['asset-type','TEXT'],['asset-payload','synthetic']]) {
   const field=view.container.querySelector('#'+id),key=Object.keys(field).find(k=>k.startsWith('__reactProps'));
   await act(async()=>field[key].onChange({target:{value}}));
  }
  await act(async()=>view.container.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(posts,1);
  assert.equal(view.container.querySelector('#asset-name').value,'Preserved draft');
  assert.match(view.container.querySelector('[role=dialog] [role=alert]').textContent,/Đã hết chỗ/);
 }finally{await view.unmount();globalThis.fetch=original;}
});
test('Storage exhaustion also blocks new assets even when slots remain',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>quotaJson(url.includes('/subscriptions/me')?{...quotaFixture(2),storageUsedBytes:104857600}:emptyAssets);
 const view=await mount(AssetManagementPage,{vaultId:'11111111-1111-4111-8111-111111111111',accessToken:'fixture',enforceQuota:true});
 try {assert.equal(view.container.querySelector('.lv-add-btn').disabled,true);assert.match(view.container.querySelector('.lv-asset-quota-notice').textContent,/100 MB \/ 100 MB/);}
 finally{await view.unmount();globalThis.fetch=original;}
});

// Synthetic Fixture Data for Asset Tests
const testVaultId = '11111111-1111-4111-8111-111111111111';
const syntheticAssets = [
  {
    id: 'a1111111-1111-4111-8111-111111111111',
    vaultId: testVaultId,
    name: 'Thư từ biệt và tâm thư gửi con gái',
    assetType: 'TEXT',
    description: 'Lá thư tâm nguyện và lời dặn dò bí mật',
    hasPayload: true,
    createdAt: '2026-10-02T10:30:00Z',
    updatedAt: '2026-10-02T10:30:00Z',
  },
  {
    id: 'a2222222-2222-4222-8222-222222222222',
    vaultId: testVaultId,
    name: 'Tài khoản quản trị ví Ledger Nano X',
    assetType: 'CREDENTIAL',
    description: 'Cụm mật khẩu khôi phục và mã PIN phần cứng',
    hasPayload: true,
    createdAt: '2026-10-05T14:15:00Z',
    updatedAt: '2026-10-05T14:15:00Z',
  },
  {
    id: 'a3333333-3333-4333-8333-333333333333',
    vaultId: testVaultId,
    name: 'Danh mục tài sản bất động sản',
    assetType: 'TEXT',
    description: 'Ghi chú các vị trí lưu trữ hồ sơ công chứng',
    hasPayload: false,
    createdAt: '2026-10-08T09:00:00Z',
    updatedAt: '2026-10-08T09:00:00Z',
  },
];

async function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

test('Read-only asset list disables desktop and mobile edit controls while preserving view', async () => {
  let views = 0;
  const view = await mount(AssetListTable, { assets: syntheticAssets, lang: 'vi', query: { page: 0, size: 10, sort: 'createdAt,desc' }, totalElements: syntheticAssets.length, onQueryChange() {}, onViewAsset() { views++; } });
  try {
    const buttons = [...view.container.querySelectorAll('button')];
    const edit = buttons.filter(button => button.textContent.trim() === ASSET_I18N.vi.assets.actions.edit);
    assert.equal(edit.length, syntheticAssets.length * 2);
    assert.ok(edit.every(button => button.disabled));
    const open = buttons.find(button => button.textContent.trim() === ASSET_I18N.vi.assets.actions.view);
    assert.equal(open.disabled, false);
    await act(async () => open.click());
    assert.equal(views, 1);
  } finally { await view.unmount(); }
});

test('Read-only assets block creation even when quota enforcement is disabled', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => quotaJson(emptyAssets);
  const view = await mount(AssetManagementPage, { vaultId: testVaultId, accessToken: 'fixture', readOnly: true });
  try {
    assert.equal(view.container.querySelector('.lv-add-btn').disabled, true);
    assert.equal(view.container.querySelector('.lv-mobile-fab').disabled, true);
    assert.match(view.container.textContent, /Kho hiện chỉ được xem/);
    assert.equal(view.container.querySelector('[role=dialog]'), null);
  } finally { await view.unmount(); globalThis.fetch = original; }
});

test('AssetSummaryCards: Render chính xác 3 khối thống kê với synthetic fixture data', async () => {
  const view = await mount(AssetSummaryCards, {
    assets: syntheticAssets,
    lang: 'vi',
    t: ASSET_I18N.vi,
  });

  try {
    const cards = view.container.querySelectorAll('.lv-stat-card');
    assert.equal(cards.length, 3, 'Phải có đúng 3 khối thống kê');

    // Thẻ 1: Tổng số tài sản
    const totalCountVal = cards[0].querySelector('.lv-stat-card__value');
    assert.equal(totalCountVal?.textContent?.trim(), '3');

    // Thẻ 2: Trạng thái bảo mật
    const securityVal = cards[1].querySelector('.lv-stat-card__value');
    assert.equal(securityVal?.textContent?.trim(), '2');

    // Thẻ 3: Phân bổ loại tài sản
    const pills = cards[2].querySelectorAll('.lv-dist-pill');
    assert.equal(pills.length, 2, 'Có 2 pill phân bổ loại');
    assert.match(pills[0].textContent, /2/, 'TEXT count = 2');
    assert.match(pills[1].textContent, /1/, 'CREDENTIAL count = 1');
  } finally {
    await view.unmount();
  }
});

test('AssetListTable: Bảng máy tính hiển thị hàng 58px, cột thao tác và nút Xem/Sửa hoạt động', async () => {
  let viewedAsset = null;
  let editedAsset = null;

  const query = { page: 0, size: 20, sort: 'createdAt,desc' };
  const view = await mount(AssetListTable, {
    assets: syntheticAssets,
    totalElements: 3,
    query,
    lang: 'vi',
    t: ASSET_I18N.vi,
    onQueryChange: () => {},
    onViewAsset: (asset) => {
      viewedAsset = asset;
    },
    onEditAsset: (asset) => {
      editedAsset = asset;
    },
  });

  try {
    // 1. Kiểm tra số hàng bảng desktop
    const rows = view.container.querySelectorAll('tbody tr.lv-table-row--fixed');
    assert.equal(rows.length, 3, 'Desktop table phải hiển thị đủ 3 hàng');

    // 2. Kiểm tra tên tài sản
    const firstRowName = rows[0].querySelector('.lv-asset-primary-title');
    assert.equal(firstRowName?.textContent?.trim(), 'Thư từ biệt và tâm thư gửi con gái');

    // 3. Kiểm tra nút thao tác Xem và Sửa trong desktop row
    const firstRowActionBtns = rows[0].querySelectorAll('.lv-asset-action-btn');
    assert.equal(firstRowActionBtns.length, 2, 'Mỗi hàng phải có 2 nút thao tác');

    // Click nút Xem
    await act(async () => {
      firstRowActionBtns[0].click();
    });
    assert.ok(viewedAsset, 'Callback onViewAsset phải được gọi');
    assert.equal(viewedAsset.id, syntheticAssets[0].id);

    // Click nút Sửa
    await act(async () => {
      firstRowActionBtns[1].click();
    });
    assert.ok(editedAsset, 'Callback onEditAsset phải được gọi');
    assert.equal(editedAsset.id, syntheticAssets[0].id);

    // 4. Kiểm tra phân trang hiển thị đúng số liệu
    const paginationInfo = view.container.querySelector('.lv-pagination-info');
    assert.match(paginationInfo?.textContent, /1.*3/);
  } finally {
    await view.unmount();
  }
});

test('AssetListTable: Mobile card list hiển thị đủ thẻ, nút Xem/Sửa đạt chuẩn class lv-asset-mobile-btn', async () => {
  let viewedAsset = null;
  const query = { page: 0, size: 20, sort: 'createdAt,desc' };
  const view = await mount(AssetListTable, {
    assets: syntheticAssets,
    totalElements: 3,
    query,
    lang: 'vi',
    t: ASSET_I18N.vi,
    onQueryChange: () => {},
    onViewAsset: (asset) => {
      viewedAsset = asset;
    },
    onEditAsset: () => {},
  });

  try {
    const mobileCards = view.container.querySelectorAll('.lv-mobile-card');
    assert.equal(mobileCards.length, 3, 'Mobile view phải render 3 thẻ');

    const firstCardActions = mobileCards[0].querySelectorAll('.lv-asset-mobile-btn');
    assert.equal(firstCardActions.length, 2, 'Mỗi thẻ mobile phải có 2 nút thao tác Xem và Sửa');

    await act(async () => {
      firstCardActions[0].click();
    });
    assert.equal(viewedAsset?.id, syntheticAssets[0].id, 'Nút Xem trên thẻ mobile kích hoạt đúng asset');
  } finally {
    await view.unmount();
  }
});

test('AssetManagementPage: Skeleton hiển thị đủ 3 khối thống kê và khung chờ bảng có lv-skeleton-pulse', async () => {
  const originalFetch = globalThis.fetch;
  // Pending fetch to stay in loading state
  globalThis.fetch = () => new Promise(() => {});

  try {
    const view = await mount(AssetManagementPage, {
      vaultId: '11111111-1111-4111-8111-111111111111',
      accessToken: 'test-token',
      lang: 'vi',
    });

    try {
      const skeleton = view.container.querySelector('.lv-asset-skeleton');
      assert.ok(skeleton, 'Phải render component .lv-asset-skeleton khi loading');

      // 1. Kiểm tra 3 khối thống kê trong skeleton
      const statBlocks = skeleton.querySelectorAll('.lv-asset-skeleton__stat');
      assert.equal(statBlocks.length, 3, 'Phải có đủ 3 khối thống kê skeleton');

      // 2. Kiểm tra toolbar skeleton
      const toolbar = skeleton.querySelector('.lv-asset-skeleton__toolbar');
      assert.ok(toolbar, 'Phải có toolbar skeleton');

      // 3. Kiểm tra khung chờ các hàng bảng skeleton
      const tableSkeleton = skeleton.querySelector('.lv-asset-skeleton__table');
      assert.ok(tableSkeleton, 'Phải có table skeleton');

      const rows = tableSkeleton.querySelectorAll('.lv-asset-skeleton__row');
      assert.equal(rows.length, 4, 'Bảng skeleton phải có 4 hàng mô phỏng');

      // 4. Kiểm tra class lv-skeleton-pulse được gắn đầy đủ
      const pulseElements = skeleton.querySelectorAll('.lv-skeleton-pulse');
      assert.ok(pulseElements.length >= 20, 'Các thành phần con skeleton phải sử dụng class lv-skeleton-pulse');
    } finally {
      await view.unmount();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AssetManagementPage: Tìm kiếm không khớp hiển thị empty card và nút Xóa bộ lọc', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        page: 0,
        size: 20,
        totalElements: syntheticAssets.length,
        totalPages: 1,
        content: syntheticAssets,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  try {
    const view = await mount(AssetManagementPage, {
      vaultId: '11111111-1111-4111-8111-111111111111',
      accessToken: 'test-token',
      lang: 'vi',
    });

    try {
      // Đợi loadAssets hoàn tất
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Kiểm tra input tìm kiếm
      const searchInput = view.container.querySelector('.lv-search-input');
      assert.ok(searchInput, 'Phải có input tìm kiếm');

      // Nhập từ khóa không khớp thông qua React onChange handler
      const reactPropKey = Object.keys(searchInput).find((k) => k.startsWith('__reactProps'));
      assert.ok(reactPropKey, 'Phải tìm thấy React props trên search input');
      await act(async () => {
        searchInput[reactPropKey].onChange({ target: { value: 'tu_khoa_khong_ton_tai_123456' } });
      });

      // Chờ debounce search (250ms)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });

      // Kiểm tra empty card không có kết quả
      const emptyTitle = view.container.querySelector('.lv-empty-title');
      assert.match(emptyTitle?.textContent, /Không tìm thấy/i, 'Phải hiển thị tiêu đề không tìm thấy kết quả');

      const clearBtn = view.container.querySelector('.lv-empty-actions-row button');
      assert.match(clearBtn?.textContent, /Xóa bộ lọc/i, 'Phải có nút Xóa bộ lọc');

      // Click Xóa bộ lọc để khôi phục
      const clearBtnPropKey = Object.keys(clearBtn).find((k) => k.startsWith('__reactProps'));
      await act(async () => {
        if (clearBtnPropKey) {
          clearBtn[clearBtnPropKey].onClick();
        } else {
          clearBtn.click();
        }
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });

      // Bảng quay trở lại hiển thị 3 hàng
      const restoredRows = view.container.querySelectorAll('tbody tr.lv-table-row--fixed');
      assert.equal(restoredRows.length, 3, 'Sau khi xóa bộ lọc, bảng hiển thị lại 3 hàng');
    } finally {
      await view.unmount();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CSS Verification: Chiều cao hàng 58px, mobile touch target 44px, FAB padding và reduced-motion', () => {
  const assetPageCss = fs.readFileSync(
    path.join(__dirname, '../pages/assets/AssetManagementPage.css'),
    'utf-8'
  );
  const assetTableCss = fs.readFileSync(
    path.join(__dirname, '../components/assets/AssetListTable.css'),
    'utf-8'
  );

  // 1. Chiều cao hàng bảng 58px
  assert.match(assetTableCss, /\.lv-table-row--fixed\s*\{\s*height:\s*58px;/, 'Bảng phải dùng chiều cao hàng 58px');

  // 2. Mobile touch target nút thao tác tối thiểu 44px
  assert.match(assetTableCss, /\.lv-asset-mobile-btn[\s\S]*?min-height:\s*44px/i, 'Nút mobile phải có min-height tối thiểu 44px');

  // 3. Mobile input tìm kiếm & lọc tối thiểu 44px
  assert.match(assetPageCss, /\.lv-search-input[\s\S]*?min-height:\s*44px/i, 'Input tìm kiếm mobile phải có min-height tối thiểu 44px');
  assert.match(assetPageCss, /\.lv-category-select[\s\S]*?min-height:\s*44px/i, 'Select lọc mobile phải có min-height tối thiểu 44px');

  // 4. FAB không che nội dung (padding-bottom >= 96px trên mobile)
  assert.match(assetPageCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?padding-bottom:\s*96px/, 'Mobile page phải có padding-bottom: 96px để không bị FAB che');

  // 5. Skeleton pulse và reduced-motion
  assert.match(assetPageCss, /\.lv-skeleton-pulse\s*\{/, 'Phải có class .lv-skeleton-pulse');
  assert.match(assetPageCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.lv-skeleton-pulse[\s\S]*?animation:\s*none/i, 'prefers-reduced-motion phải tắt animation skeleton');
});

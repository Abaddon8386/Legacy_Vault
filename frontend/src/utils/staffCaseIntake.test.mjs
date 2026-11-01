import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

import {
  validateIntakeForm,
  submitPhysicalIntakeRecord,
  SYNTHETIC_STAFF_CASES,
  validateIntakeReceipt,
} from '../pages/staff/staffIntakeService.js';
import { getStaffCaseTranslations } from '../pages/staff/staffCaseI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/staff/cases?preview=true',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
if (!dom.window.Element.prototype.scrollIntoView) {
  dom.window.Element.prototype.scrollIntoView = () => {};
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Helper cập nhật input/select cho React 18 trong JSDOM
function changeInput(element, value) {
  if (!element) return;
  const isSelect = element.tagName === 'SELECT';
  const prototype = isSelect
    ? dom.window.HTMLSelectElement.prototype
    : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  if (element._valueTracker) {
    element._valueTracker.setValue('');
  }
  element.dispatchEvent(new dom.window.Event(isSelect ? 'change' : 'input', { bubbles: true }));
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

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

const intakeMod = await loadComponentModule('src/pages/staff/StaffCaseIntakePage.jsx');
const StaffCaseIntakePage = intakeMod.default;


async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    host,
    render: async (nextProps) => {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
    close: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

const mockCase = {
  id: 'case-test-01',
  caseNumber: 'CASE-2026-001',
  ownerName: 'Nguyễn Văn An',
  ownerFullName: 'Nguyễn Văn An',
  ownerEmail: 'an.nguyen@example.com',
  vaultName: 'Kho Di Sản Gia Đình',
  status: 'PENDING',
  intakeChannel: 'PHYSICAL_IN_PERSON',
  createdAt: '2026-10-12T08:30:00Z',
};

// ============================================================================
// 1. UNIT TESTS: VALIDATION SERVICE (PS-26 / PS-38)
// ============================================================================

test('PS-26 Validation: Valid form passes with minimal required physical metadata', () => {
  const validData = {
    submitterName: 'Trần Văn Bình',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường Bến Nghé, Quận 1, TP.HCM',
    documentNumber: '123/2026/TL-KT',
    issuingDate: '2026-10-10',
    intakeDateTime: '2026-10-15T14:30',
  };

  const result = validateIntakeForm(validData, 'vi');
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
});

test('PS-26 Validation: Rejects missing required fields and supports English localization', () => {
  const emptyData = {};
  const resVi = validateIntakeForm(emptyData, 'vi');
  assert.equal(resVi.isValid, false);
  assert.ok(resVi.errors.submitterName);
  assert.ok(resVi.errors.documentType);
  assert.equal(resVi.errors.issuingAuthority, undefined);
  assert.equal(resVi.errors.documentNumber, undefined);
  assert.equal(resVi.errors.issuingDate, undefined);
  assert.ok(resVi.errors.intakeDateTime);

  const resEn = validateIntakeForm(emptyData, 'en');
  assert.equal(resEn.isValid, false);
  const tEn = getStaffCaseTranslations('en').intake.validation;
  assert.equal(resEn.errors.submitterName, tEn.submitterNameRequired);
  assert.equal(resEn.errors.documentType, tEn.documentTypeRequired);
});

test('PS-26 Validation: optional dates reject invalid calendar values without inventing future-date rules', () => {
  const data = { submitterName: 'A', documentType: 'DEATH_EXTRACT', intakeDateTime: '2026-10-16T14:30' };
  assert.equal(validateIntakeForm(data).isValid, true);
  assert.ok(validateIntakeForm({ ...data, issuingDate: '2026-02-30' }).errors.issuingDate);
  assert.equal(validateIntakeForm({ ...data, issuingDate: '2099-01-01' }).isValid, true);
  for (const value of ['2026-02-30T14:30', '2026-10-16T25:00', 'not-a-date']) {
    assert.ok(validateIntakeForm({ ...data, intakeDateTime: value }, 'en').errors.intakeDateTime);
  }
  assert.ok(validateIntakeForm({ ...data, submitterPhone: '0|12345678' }).errors.submitterPhone);
});

test('PS-26 Validation: Validates optional proposed fields (phone, email) if entered', () => {
  const dataWithInvalidPhone = {
    submitterName: 'Hoàng Văn C',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường 5',
    documentNumber: '88/2026',
    issuingDate: '2026-10-01',
    intakeDateTime: '2026-10-15T10:00',
    submitterPhone: '12345', // sai định dạng
    submitterEmail: 'invalid-email', // sai định dạng
  };

  const res = validateIntakeForm(dataWithInvalidPhone, 'vi');
  assert.equal(res.isValid, false);
  assert.ok(res.errors.submitterPhone);
  assert.ok(res.errors.submitterEmail);

  // Nhập đúng format
  const dataWithValidPhone = {
    ...dataWithInvalidPhone,
    submitterPhone: '0912345678',
    submitterEmail: 'contact@example.com',
  };
  const resValid = validateIntakeForm(dataWithValidPhone, 'vi');
  assert.equal(resValid.isValid, true);
});

// ============================================================================
// 2. UNIT TESTS: INTAKE SUBMISSION SERVICE & BOUNDARY GUARDS
// ============================================================================

test('PS-26 Service: Missing caseId rejects with MISSING_CASE_ID', async () => {
  await assert.rejects(
    async () => {
      await submitPhysicalIntakeRecord('', {}, { isTest: true });
    },
    (err) => err.code === 'MISSING_CASE_ID'
  );
});

test('PS-26 Service: Invalid form data rejects with VALIDATION_FAILED and fieldErrors', async () => {
  await assert.rejects(
    async () => {
      await submitPhysicalIntakeRecord('case-01', { submitterName: '' }, { isTest: true });
    },
    (err) => {
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.ok(err.fieldErrors.submitterName);
      return true;
    }
  );
});

test('PS-26 Service: Live mode rejects guessed contracts and throws BACKEND_NOT_READY (503)', async () => {
  const validData = {
    submitterName: 'Trần Văn Bình',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường Bến Nghé',
    documentNumber: '123/2026',
    issuingDate: '2026-10-10',
    intakeDateTime: '2026-10-15T14:30',
  };

  await assert.rejects(
    async () => {
      // Live mode: không có isDevPreview, không có isTest
      await submitPhysicalIntakeRecord('case-01', validData, {
        isDevPreview: false,
        accessToken: 'staff-token-live',
      });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      assert.equal(err.status, 503);
      assert.match(err.message, /PS-38/);
      return true;
    }
  );
});

test('PS-26 Service: DEV preview simulation returns receipt without changing case or workflow state', async () => {
  const validData = {
    submitterName: 'Trần Văn Bình',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường Bến Nghé',
    documentNumber: '123/2026/GCT',
    issuingDate: '2026-10-10',
    intakeDateTime: '2026-10-15T14:30',
  };

  const targetCase = SYNTHETIC_STAFF_CASES[0];
  const originalCase = structuredClone(targetCase);

  const result = await submitPhysicalIntakeRecord(targetCase.id, validData, {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.caseId, targetCase.id);
  assert.ok(result.receiptNumber.startsWith('INTAKE-'));
  assert.equal(result.isSimulation, true);
  assert.deepEqual(targetCase, originalCase);
});

// ============================================================================
// 3. COMPONENT TESTS: StaffCaseIntakePage
// ============================================================================

test('PS-26 Component: Missing caseItem renders safe fallback without submit form', async () => {
  let backClicked = false;
  const view = await mount(StaffCaseIntakePage, {
    caseItem: null,
    onBack: () => { backClicked = true; },
    isDevPreview: true,
  });

  const text = view.host.textContent;
  assert.match(text, /Thiếu thông tin ngữ cảnh hồ sơ/);
  assert.equal(view.host.querySelector('form'), null);

  const backBtn = view.host.querySelector('.lv-intake-back-btn, .lv-intake-state-actions button');
  assert.ok(backBtn);
  await act(async () => {
    backBtn.click();
  });
  assert.equal(backClicked, true);

  await view.close();
});

test('PS-26 Component: Renders 4 sections and legal boundary notice', async () => {
  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    onBack: () => {},
    isDevPreview: true,
  });

  const text = view.host.textContent;

  // Ranh giới nghiệp vụ
  assert.match(text, /Tiếp nhận hồ sơ chưa phải xác nhận tử vong hoặc phê duyệt pháp lý/);

  // Section A: Case context
  assert.match(text, /CASE-2026-001/);
  assert.match(text, /Nguyễn Văn An/);
  assert.match(text, /Kho Di Sản Gia Đình/);

  // Section B: Submitter info
  assert.match(text, /Thông tin người nộp hồ sơ/);
  assert.match(text, /không yêu cầu.*tài khoản/i);

  // Section C: Physical document
  assert.match(text, /Thông tin giấy tờ bản cứng/);
  assert.match(text, /Loại giấy tờ/);
  assert.match(text, /Cơ quan cấp/);

  // Section D: Review & Action
  assert.match(text, /D\.\s*Xem lại & Xác nhận tiếp nhận/);
  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');
  assert.ok(submitBtn);

  await view.close();
});

test('PS-26 Component: Submitting invalid form shows inline field errors and blocks submission', async () => {
  let submitted = false;
  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    onSubmitRecord: async () => {
      submitted = true;
      return { success: true };
    },
    isDevPreview: true,
  });

  // Bấm submit ngay khi chưa điền tên người nộp
  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');
  await act(async () => {
    submitBtn.click();
  });

  assert.equal(submitted, false);
  const errorItems = view.host.querySelectorAll('.lv-intake-error-text');
  assert.ok(errorItems.length > 0);

  await view.close();
});

test('PS-26 Component: Backend error preserves form data and shows retry option', async () => {
  const failingSubmit = async () => {
    const err = new Error('Dịch vụ tiếp nhận hồ sơ tử vong bản cứng (PS-38) hiện chưa được kết nối máy chủ.');
    err.code = 'BACKEND_NOT_READY';
    err.status = 503;
    throw err;
  };

  const initialValidData = {
    submitterName: 'Phạm Văn Nam',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường Đa Kao',
    documentNumber: '999/2026/GCT',
    issuingDate: '2026-10-01',
    intakeDateTime: '2026-10-15T14:30',
  };

  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    initialData: initialValidData,
    onSubmitRecord: failingSubmit,
    isDevPreview: false, // Live mode
  });

  // Bấm gửi
  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');
  await act(async () => {
    submitBtn.click();
  });

  // Kiểm tra lỗi 503 hiển thị
  const alertText = view.host.querySelector('.lv-intake-error-banner')?.textContent;
  assert.match(alertText, /Dịch vụ tiếp nhận hồ sơ chưa sẵn sàng/);
  assert.match(alertText, /PS-38/);

  // Form data phải được giữ nguyên, không bị xoá
  const nameInput = view.host.querySelector('#intake-submitter-name');
  const authorityInput = view.host.querySelector('#intake-issuing-auth');
  const numberInput = view.host.querySelector('#intake-doc-number');
  assert.equal(nameInput.value, 'Phạm Văn Nam');
  assert.equal(authorityInput.value, 'UBND Phường Đa Kao');
  assert.equal(numberInput.value, '999/2026/GCT');

  await view.close();
});

test('PS-26 Component: Successful submission displays receipt with simulated number and return button', async () => {
  let backClicked = false;
  const mockSubmit = async () => ({
    success: true,
    caseId: mockCase.id,
    receiptNumber: 'INTAKE-2026-8888',
    recordedAt: '2026-10-15T15:00:00Z',
    isSimulation: true,
  });

  const initialValidData = {
    submitterName: 'Nguyễn Thị Cúc',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Phường Cầu Ông Lãnh',
    documentNumber: '777/2026/GCT',
    issuingDate: '2026-10-02',
    intakeDateTime: '2026-10-15T15:00',
  };

  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    initialData: initialValidData,
    onSubmitRecord: mockSubmit,
    onBack: () => { backClicked = true; },
    isDevPreview: true,
  });

  // Submit
  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');
  await act(async () => {
    submitBtn.click();
  });

  // Kiểm tra hiển thị receipt
  const receiptCard = view.host.querySelector('.lv-intake-success-card');
  assert.ok(receiptCard);
  assert.match(receiptCard.textContent, /INTAKE-2026-8888/);
  assert.match(receiptCard.textContent, /Tiếp nhận hồ sơ thành công/);

  // Bấm quay về danh sách
  const backBtn = receiptCard.querySelector('.lv-intake-success-actions button');
  await act(async () => {
    backBtn.click();
  });
  assert.equal(backClicked, true);

  await view.close();
});

test('PS-26 Component: Double submit prevention and in-flight loading state', async () => {
  let callCount = 0;
  let resolveSubmit;
  const slowSubmit = () => {
    callCount += 1;
    return new Promise((r) => { resolveSubmit = r; });
  };

  const initialValidData = {
    submitterName: 'Lê Hoàng Nam',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Quận 1',
    documentNumber: '111/2026/GCT',
    issuingDate: '2026-10-01',
    intakeDateTime: '2026-10-15T15:00',
  };

  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    initialData: initialValidData,
    onSubmitRecord: slowSubmit,
    isDevPreview: true,
  });

  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');

  // Bấm submit lần 1
  await act(async () => {
    submitBtn.click();
  });

  assert.equal(callCount, 1);
  assert.equal(submitBtn.disabled, true);

  // Thử bấm submit lần 2 khi đang in-flight -> bị chặn
  await act(async () => {
    submitBtn.click();
  });
  assert.equal(callCount, 1);

  // Kết thúc submit
  await act(async () => {
    resolveSubmit({ success: true, receiptNumber: 'INTAKE-1234' });
  });

  await view.close();
});

test('PS-26 Component: Changing case resets state and discards late responses', async () => {
  let resolveFirst;
  const delayedFirstSubmit = () => new Promise((r) => { resolveFirst = r; });

  const initialValidData = {
    submitterName: 'Đặng Thùy Dương',
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Quận 3',
    documentNumber: '222/2026/GCT',
    issuingDate: '2026-10-02',
    intakeDateTime: '2026-10-15T15:00',
  };

  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase,
    initialData: initialValidData,
    onSubmitRecord: delayedFirstSubmit,
    isDevPreview: true,
  });

  // Bấm submit case 1
  const submitBtn = view.host.querySelector('.lv-intake-submit-btn');
  await act(async () => {
    submitBtn.click();
  });

  // Thay đổi sang case 2 trước khi response của case 1 về
  const case2 = {
    ...mockCase,
    id: 'case-test-02',
    caseNumber: 'CASE-2026-002',
    ownerName: 'Võ Thành Đạt',
  };

  await view.render({
    caseItem: case2,
    initialData: initialValidData,
    onSubmitRecord: delayedFirstSubmit,
    isDevPreview: true,
  });

  // Bây giờ response của case 1 mới resolve
  await act(async () => {
    resolveFirst({ success: true, caseId: 'case-test-01', receiptNumber: 'INTAKE-OLD-01' });
  });

  // Phản hồi cũ của case 1 không được hiển thị làm biên nhận của case 2
  assert.equal(view.host.querySelector('.lv-intake-success-card'), null);
  assert.match(view.host.textContent, /CASE-2026-002/);

  await view.close();
});


const minimalData = { submitterName: 'A', documentType: 'DEATH_EXTRACT', intakeDateTime: '2026-10-16T09:15' };
const receipt = { success: true, caseId: mockCase.id, receiptNumber: 'INTAKE-TEST', recordedAt: '2026-10-16T02:15:00Z', isSimulation: true };

test('PS-26 Component: explicit blank time and type; never collects full identity number', async () => {
  const view = await mount(StaffCaseIntakePage, { caseItem: mockCase, isDevPreview: true });
  assert.equal(view.host.querySelector('#intake-datetime').value, '');
  assert.equal(view.host.querySelector('input[type="time"]').value, '');
  assert.equal(view.host.querySelector('[data-field="documentType"] select').value, '');
  assert.equal(view.host.querySelector('[data-field="submitterIdNumber"]'), null);
  await view.close();
});

test('PS-26 Component: payload whitelist excludes identity and actor; preserves literal local receipt time', async () => {
  let payload;
  const view = await mount(StaffCaseIntakePage, { caseItem: mockCase, isDevPreview: true,
    initialData: { ...minimalData, submitterIdNumber: 'SECRET-ID', actorId: 'forged' },
    onSubmitRecord: async (_, data) => { payload = data; return receipt; } });
  await act(async () => view.host.querySelector('.lv-intake-submit-btn').click());
  assert.equal(payload.intakeDateTime, minimalData.intakeDateTime);
  assert.equal('submitterIdNumber' in payload, false);
  assert.equal('actorId' in payload, false);
  assert.ok(view.host.querySelector('.lv-intake-success-card'));
  await view.close();
});

test('PS-26 Component: switching case or auth context resets fields/loading and ignores aborted late receipt', async () => {
  let resolve, signal;
  const props = { caseItem: mockCase, isDevPreview: true, initialData: minimalData,
    onSubmitRecord: (_, __, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); } };
  const view = await mount(StaffCaseIntakePage, props);
  await act(async () => view.host.querySelector('.lv-intake-submit-btn').click());
  await view.render({ ...props, caseItem: { ...mockCase, id: 'case-B' }, initialData: {} });
  assert.equal(signal.aborted, true);
  assert.equal(view.host.querySelector('#intake-submitter-name').value, '');
  assert.equal(view.host.querySelector('.lv-intake-submit-btn').disabled, false);
  await view.render({ ...props, initialData: {} });
  await act(async () => resolve(receipt));
  assert.equal(view.host.querySelector('.lv-intake-success-card'), null);
  await view.render({ ...props, accessToken: 'new-session', initialData: {} });
  assert.equal(view.host.querySelector('#intake-submitter-name').value, '');
  await view.close();
});

test('PS-26 Receipt: malformed and mismatched preview responses are rejected, including simulation in live', () => {
  for (const invalid of [null, {}, { ...receipt, success: false }, { ...receipt, caseId: 'other' },
    { ...receipt, receiptNumber: ' ' }, { ...receipt, recordedAt: '2026-02-30T00:00:00Z' },
    { ...receipt, isSimulation: false }]) {
    assert.throws(() => validateIntakeReceipt(invalid, mockCase.id, { isDevPreview: true }));
  }
  assert.throws(() => validateIntakeReceipt(receipt, mockCase.id, { accessToken: 'live', isDevPreview: true }));
});

test('PS-26 Component: invalid receipt shows safe error, keeps form and permits retry', async () => {
  let calls = 0;
  const view = await mount(StaffCaseIntakePage, { caseItem: mockCase, isDevPreview: true,
    initialData: minimalData, onSubmitRecord: async () => (++calls === 1 ? { ...receipt, caseId: 'wrong', message: 'SECRET' } : receipt) });
  await act(async () => view.host.querySelector('.lv-intake-submit-btn').click());
  assert.equal(view.host.querySelector('.lv-intake-success-card'), null);
  assert.ok(view.host.querySelector('.lv-intake-error-banner'));
  assert.equal(view.host.textContent.includes('SECRET'), false);
  assert.equal(view.host.querySelector('#intake-submitter-name').value, 'A');
  await act(async () => view.host.querySelector('.lv-intake-submit-btn').click());
  assert.ok(view.host.querySelector('.lv-intake-success-card'));
  await view.close();
});


test('PS-26 Component: user-entered local datetime updates review without timezone conversion', async () => {
  const view = await mount(StaffCaseIntakePage, { caseItem: mockCase, isDevPreview: true });
  await act(async () => {const field=view.host.querySelector('#intake-datetime');field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].onChange({target:{value:'16/10/2026'}});});
  await act(async () => {const field=view.host.querySelector('#intake-datetime');field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].onBlur();});
  await act(async () => {const field=view.host.querySelector('input[type="time"]');field[Object.keys(field).find(key=>key.startsWith('__reactProps$'))].onChange({target:{value:'09:15'}});});
  assert.match(view.host.querySelector('.lv-intake-review-list').textContent, /2026-10-16T09:15/);
  await view.close();
});

test('PS-26 Production: preview/test flags cannot produce a synthetic intake receipt', async () => {
  const production = await loadComponentModule('src/pages/staff/staffIntakeService.js', true);
  await assert.rejects(() => production.submitPhysicalIntakeRecord(mockCase.id, minimalData,
    { isDevPreview: true, isTest: true }), error => error.code === 'BACKEND_NOT_READY');
});


test('PS-26 locale: existing validation follows VI/EN without clearing entered data', async () => {
  const props = { caseItem: mockCase, isDevPreview: true, lang: 'vi', initialData: { physicalNotes: 'Preserve this note' } };
  const view = await mount(StaffCaseIntakePage, props);
  try {
    await act(async () => view.host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.ok(view.host.textContent.includes(getStaffCaseTranslations('vi').intake.validation.submitterNameRequired));
    await view.render({ ...props, lang: 'en' });
    assert.ok(view.host.textContent.includes(getStaffCaseTranslations('en').intake.validation.submitterNameRequired));
    assert.equal(view.host.textContent.includes(getStaffCaseTranslations('vi').intake.validation.submitterNameRequired), false);
    assert.equal(view.host.querySelector('textarea').value, 'Preserve this note');
  } finally { await view.close(); }
});

for (const status of [401, 403]) test('PS-26 auth: HTTP ' + status + ' has distinct feedback and preserves form', async () => {
  let expired = 0;
  const view = await mount(StaffCaseIntakePage, {
    caseItem: mockCase, accessToken: 'synthetic-auth-test', lang: 'en',
    initialData: { submitterName: 'Synthetic Person', documentType: 'DEATH_CERTIFICATE', intakeDateTime: '2026-10-16T10:00' },
    onUnauthorized: () => expired++,
    onSubmitRecord: async () => { throw { status }; },
  });
  try {
    await act(async () => view.host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.ok(view.host.textContent.includes(status === 401 ? 'Session expired' : 'Access denied'));
    assert.equal(expired, status === 401 ? 1 : 0);
    assert.equal(view.host.querySelector('input').value, 'Synthetic Person');
  } finally { await view.close(); }
});

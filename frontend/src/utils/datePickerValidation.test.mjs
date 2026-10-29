import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { isValidCalendarDate, formatIsoToDisplay, parseDisplayToIso } from './datePickerHelpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../..');

const dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.Element.prototype.attachEvent = () => {};
dom.window.Element.prototype.detachEvent = () => {};

async function loadComponentModule(entry) {
  const result = await build({
    root: frontendRoot,
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: path.resolve(frontendRoot, entry), formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  }
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const datePickerModule = await loadComponentModule('src/components/common/DatePicker.jsx');
const DatePicker = datePickerModule.default || datePickerModule.DatePicker;

const props = (el) => el[Object.keys(el).find((k) => k.startsWith('__reactProps$'))];

async function mountPicker(propsObj) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DatePicker, propsObj));
  });
  return {
    host,
    input: host.querySelector('.lv-datepicker-input'),
    rerender: async (newProps) => {
      await act(async () => {
        root.render(React.createElement(DatePicker, newProps));
      });
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test('isValidCalendarDate strictly checks days in month and leap years', () => {
  assert.equal(isValidCalendarDate(2026, 2, 31), false, '2026-02-31 must be false');
  assert.equal(isValidCalendarDate(2026, 2, 29), false, '2026-02-29 must be false (non leap year)');
  assert.equal(isValidCalendarDate(2026, 2, 28), true, '2026-02-28 must be true');
  assert.equal(isValidCalendarDate(2024, 2, 29), true, '2024-02-29 must be true (leap year)');
  assert.equal(isValidCalendarDate(2025, 2, 29), false, '2025-02-29 must be false');
  assert.equal(isValidCalendarDate(2026, 4, 31), false, 'April 31st must be false');
  assert.equal(isValidCalendarDate(2026, 4, 30), true, 'April 30th must be true');
});

test('parseDisplayToIso strictly rejects invalid calendar dates without emitting invalid ISO', () => {
  assert.equal(parseDisplayToIso('31/02/2026', false), null);
  assert.equal(parseDisplayToIso('29/02/2025', false), null);
  assert.equal(parseDisplayToIso('2026-02-31', true), null);
  assert.equal(parseDisplayToIso('20/05/1990', false), '1990-05-20');
  assert.equal(parseDisplayToIso('1990-05-20', true), '1990-05-20');
  assert.equal(parseDisplayToIso('29/02/2024', false), '2024-02-29');
});

test('DatePicker mounts with initial value and format: VI shows DD/MM/YYYY, EN shows YYYY-MM-DD', async () => {
  const viPicker = await mountPicker({ value: '1990-05-20', lang: 'vi' });
  try {
    assert.equal(viPicker.input.value, '20/05/1990', 'VI datepicker must display 20/05/1990 on mount');
  } finally {
    await viPicker.close();
  }

  const enPicker = await mountPicker({ value: '1990-05-20', lang: 'en' });
  try {
    assert.equal(enPicker.input.value, '1990-05-20', 'EN datepicker must display 1990-05-20 on mount');
  } finally {
    await enPicker.close();
  }
});

test('DatePicker updates display format immediately when switching VI -> EN with unchanged value', async () => {
  const picker = await mountPicker({ value: '1990-05-20', lang: 'vi' });
  try {
    assert.equal(picker.input.value, '20/05/1990');
    await picker.rerender({ value: '1990-05-20', lang: 'en' });
    assert.equal(picker.input.value, '1990-05-20', 'Must re-format to YYYY-MM-DD when lang switches to EN');
    await picker.rerender({ value: '1990-05-20', lang: 'vi' });
    assert.equal(picker.input.value, '20/05/1990', 'Must re-format back to DD/MM/YYYY when lang switches to VI');
  } finally {
    await picker.close();
  }
});

test('Real Form Integration: Typing invalid date (31/02/2026) invalidates form, updates parent state, blocks old value submission', async () => {
  let submittedPayload = null;

  function TestForm() {
    const [date, setDate] = useState('2026-01-20');
    const handleSubmit = (e) => {
      e.preventDefault();
      // Form must check native validity and internal date validity
      if (!e.currentTarget.checkValidity()) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      submittedPayload = { date };
    };

    return React.createElement(
      'form',
      { onSubmit: handleSubmit, noValidate: false },
      React.createElement(DatePicker, {
        value: date,
        onChange: setDate,
        lang: 'vi',
        required: true,
      }),
      React.createElement('button', { type: 'submit' }, 'Submit')
    );
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(TestForm));
    });

    const form = host.querySelector('form');
    const input = host.querySelector('.lv-datepicker-input');

    // 1. Initial valid state: 2026-01-20 is formatted as 20/01/2026 in VI
    assert.equal(input.value, '20/01/2026');
    assert.equal(input.checkValidity(), true, 'Initial valid date must satisfy checkValidity');
    assert.equal(form.checkValidity(), true, 'Form validity must be true initially');

    // 2. User types invalid non-existent date 31/02/2026
    await act(async () => {
      props(input).onChange({ target: { value: '31/02/2026' } });
    });

    // Native validity must immediately be false
    assert.equal(input.checkValidity(), false, 'input.checkValidity() must be false on invalid date');
    assert.equal(form.checkValidity(), false, 'form.checkValidity() must be false on invalid date');

    // Blur retains typed text and displays inline error
    await act(async () => {
      props(input).onBlur();
    });
    assert.equal(input.value, '31/02/2026', 'Input text must be preserved for user editing');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    const errorMsg = host.querySelector('.lv-datepicker-error-msg');
    assert.ok(errorMsg, 'Error message should be rendered');
    assert.match(errorMsg.textContent, /hợp lệ/i);

    // 3. User attempts to submit form while input is invalid
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    // Submitted payload must NOT be called with the old date 2026-01-20!
    assert.equal(submittedPayload, null, 'Form submit must NOT succeed with old date 2026-01-20 when input is invalid');

    // 4. User corrects the date to valid 28/02/2026
    await act(async () => {
      props(input).onChange({ target: { value: '28/02/2026' } });
    });
    await act(async () => {
      props(input).onBlur();
    });

    assert.equal(input.checkValidity(), true, 'Corrected date must be valid');
    assert.equal(form.checkValidity(), true, 'Form must be valid after date correction');
    assert.equal(host.querySelector('.lv-datepicker-error-msg'), null, 'Error message must disappear');

    // 5. Submit again: now it submits with the corrected ISO date 2026-02-28
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(submittedPayload, { date: '2026-02-28' }, 'Form submit must succeed with corrected date 2026-02-28');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('Real Form Integration: Incomplete date ("nhập dở") and min/max violations block submit', async () => {
  let submittedPayload = null;

  function TestForm() {
    const [date, setDate] = useState('2026-01-10');
    const handleSubmit = (e) => {
      e.preventDefault();
      if (!e.currentTarget.checkValidity()) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      submittedPayload = { date };
    };

    return React.createElement(
      'form',
      { onSubmit: handleSubmit, noValidate: false },
      React.createElement(DatePicker, {
        value: date,
        onChange: setDate,
        min: '2026-01-01',
        max: '2026-01-31',
        lang: 'vi',
        required: true,
      }),
      React.createElement('button', { type: 'submit' }, 'Submit')
    );
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(TestForm));
    });

    const form = host.querySelector('form');
    const input = host.querySelector('.lv-datepicker-input');

    // A. Partially typed input "15/0" (incomplete)
    await act(async () => {
      props(input).onChange({ target: { value: '15/0' } });
    });
    assert.equal(input.checkValidity(), false, 'Incomplete input must fail validity');
    assert.equal(form.checkValidity(), false, 'Form validity must be false during incomplete input');

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(submittedPayload, null, 'Must NOT submit old date when input is incomplete');

    // B. Out-of-bounds date exceeding max: 15/02/2026 (max is 2026-01-31)
    await act(async () => {
      props(input).onChange({ target: { value: '15/02/2026' } });
    });
    await act(async () => {
      props(input).onBlur();
    });
    assert.equal(input.checkValidity(), false, 'Date exceeding max must fail checkValidity');
    assert.equal(form.checkValidity(), false, 'Form validity must be false when max is exceeded');
    const errorMsg = host.querySelector('.lv-datepicker-error-msg');
    assert.ok(errorMsg);
    assert.match(errorMsg.textContent, /muộn hơn/i);

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(submittedPayload, null, 'Must NOT submit old date when max is exceeded');

    // C. Date earlier than min: 25/12/2025 (min is 2026-01-01)
    await act(async () => {
      props(input).onChange({ target: { value: '25/12/2025' } });
    });
    await act(async () => {
      props(input).onBlur();
    });
    assert.equal(input.checkValidity(), false, 'Date earlier than min must fail checkValidity');
    assert.equal(form.checkValidity(), false, 'Form validity must be false when min is violated');
    const minErrorMsg = host.querySelector('.lv-datepicker-error-msg');
    assert.match(minErrorMsg.textContent, /sớm hơn/i);

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(submittedPayload, null, 'Must NOT submit old date when min is violated');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('Real Form Integration: Clearing optional vs required date behaves according to contract', async () => {
  let submittedPayload = null;

  // Optional date form
  function OptionalForm() {
    const [date, setDate] = useState('2026-01-10');
    return React.createElement(
      'form',
      {
        onSubmit: (e) => {
          e.preventDefault();
          if (!e.currentTarget.checkValidity()) return;
          submittedPayload = { date };
        },
      },
      React.createElement(DatePicker, {
        value: date,
        onChange: setDate,
        lang: 'vi',
        required: false,
      })
    );
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(OptionalForm));
    });
    const form = host.querySelector('form');
    const clearBtn = host.querySelector('.lv-datepicker-clear-btn');
    assert.ok(clearBtn, 'Clear button should exist when value is present');

    // Click clear button
    await act(async () => {
      clearBtn.click();
    });

    const input = host.querySelector('.lv-datepicker-input');
    assert.equal(input.value, '');
    assert.equal(input.checkValidity(), true, 'Empty optional input is valid');
    assert.equal(form.checkValidity(), true, 'Form is valid when optional field is cleared');

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(submittedPayload, { date: '' }, 'Cleared optional date submits empty string');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }

  // Required date form
  submittedPayload = null;
  function RequiredForm() {
    const [date, setDate] = useState('2026-01-10');
    return React.createElement(
      'form',
      {
        onSubmit: (e) => {
          e.preventDefault();
          if (!e.currentTarget.checkValidity()) return;
          submittedPayload = { date };
        },
      },
      React.createElement(DatePicker, {
        value: date,
        onChange: setDate,
        lang: 'vi',
        required: true,
      })
    );
  }

  const host2 = document.createElement('div');
  document.body.append(host2);
  const root2 = createRoot(host2);

  try {
    await act(async () => {
      root2.render(React.createElement(RequiredForm));
    });
    const form = host2.querySelector('form');
    const clearBtn = host2.querySelector('.lv-datepicker-clear-btn');

    await act(async () => {
      clearBtn.click();
    });

    const input = host2.querySelector('.lv-datepicker-input');
    assert.equal(input.value, '');
    assert.equal(input.checkValidity(), false, 'Cleared required input must be invalid');
    assert.equal(form.checkValidity(), false, 'Form must be invalid when required date is cleared');

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(submittedPayload, null, 'Must NOT submit form when required date is cleared');
  } finally {
    await act(async () => root2.unmount());
    host2.remove();
  }
});

test('DatePicker popover: opens/closes, selects date without submitting form, and Escape stops propagation to parent dialog', async () => {
  let submitCount = 0;
  let parentEscCount = 0;

  function DialogWithDatePicker() {
    const [date, setDate] = useState('2014-08-15');
    return React.createElement(
      'div',
      {
        onKeyDown: (e) => {
          if (e.key === 'Escape') parentEscCount++;
        },
      },
      React.createElement(
        'form',
        {
          onSubmit: (e) => {
            e.preventDefault();
            submitCount++;
          },
        },
        React.createElement(DatePicker, {
          value: date,
          onChange: setDate,
          lang: 'vi',
        })
      )
    );
  }

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DialogWithDatePicker));
    });

    const toggleBtn = host.querySelector('.lv-datepicker-toggle-btn');
    const input = host.querySelector('.lv-datepicker-input');
    assert.equal(input.value, '15/08/2014');
    assert.equal(host.querySelector('.lv-datepicker-popover'), null);

    // Open popover via toggle button
    await act(async () => {
      toggleBtn.click();
    });
    const popover = host.querySelector('.lv-datepicker-popover');
    assert.ok(popover, 'Popover must be open after clicking toggle button');

    // Press Escape inside DatePicker container -> closes popover, does NOT bubble to parent dialog
    const container = host.querySelector('.lv-datepicker-container');
    await act(async () => {
      container.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(host.querySelector('.lv-datepicker-popover'), null, 'Popover must close on Escape');
    assert.equal(parentEscCount, 0, 'Escape when popover is open must not bubble to parent modal listener');
    assert.equal(document.activeElement, input, 'Focus must return to date input after Escape');

    // Re-open via Alt+ArrowDown and select day 10 (2014-08-10)
    await act(async () => {
      container.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    });
    assert.ok(host.querySelector('.lv-datepicker-popover'), 'Popover must open on Alt+ArrowDown');

    const day10 = host.querySelector('button.lv-datepicker-day[data-iso="2014-08-10"]');
    assert.ok(day10, 'Day button 2014-08-10 must exist');
    await act(async () => {
      day10.click();
    });

    assert.equal(input.value, '10/08/2014', 'Input must update to 10/08/2014 after clicking day');
    assert.equal(host.querySelector('.lv-datepicker-popover'), null, 'Popover must close after selecting day');
    assert.equal(submitCount, 0, 'Selecting a date must NOT trigger form submit');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

// Small DOM helpers, formatting, dialogs and form building. No framework.

import { D } from './engine.js';
import { store } from './store.js';

// ---------------------------------------------------------------- DOM

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

// ---------------------------------------------------------------- formatting

const formatters = new Map();

export function money(amount, { signed = false, cents = true } = {}) {
  const code = store.data.settings.currencyCode || 'USD';
  const key = `${code}:${cents}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }));
  }
  const value = Math.round((amount + Number.EPSILON) * 100) / 100;
  const text = formatters.get(key).format(Math.abs(value));
  if (value < 0) return `−${text}`;
  return signed && value > 0 ? `+${text}` : text;
}

const toDate = (s) => new Date(...(([y, m, d]) => [y, m - 1, d])(s.split('-').map(Number)));

export function fmtDate(s, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return toDate(s).toLocaleDateString('en-US', options);
}

export const fmtDay = (s) => fmtDate(s, { weekday: 'long', month: 'short', day: 'numeric' });
export const fmtShort = (s) => fmtDate(s, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtMonth = (key) => fmtDate(`${key}-01`, { month: 'long', year: 'numeric' });
export const fmtMonthShort = (key) => fmtDate(`${key}-01`, { month: 'short' });

export const WEEKDAYS = [
  { value: 1, name: 'Sunday', short: 'Sun' },
  { value: 2, name: 'Monday', short: 'Mon' },
  { value: 3, name: 'Tuesday', short: 'Tue' },
  { value: 4, name: 'Wednesday', short: 'Wed' },
  { value: 5, name: 'Thursday', short: 'Thu' },
  { value: 6, name: 'Friday', short: 'Fri' },
  { value: 7, name: 'Saturday', short: 'Sat' },
];

export const ADJUSTMENTS = [
  { value: 'noAdjustment', label: 'No adjustment' },
  { value: 'previousBusinessDay', label: 'Previous business day' },
  { value: 'nextBusinessDay', label: 'Next business day' },
];

export const CATEGORIES = [
  { value: 'rent', label: 'Rent', icon: '🏠' },
  { value: 'car', label: 'Car', icon: '🚗' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'utilities', label: 'Utilities', icon: '⚡' },
  { value: 'subscription', label: 'Subscription', icon: '🔁' },
  { value: 'other', label: 'Other', icon: '💳' },
];

export const ordinal = (n) => {
  if (n === -1) return 'last day';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

export function parseMoney(text) {
  const cleaned = String(text ?? '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function scheduleText(item, kind) {
  if (kind === 'payment') {
    if (item.frequency === 'weekly') return `Every ${WEEKDAYS.find((w) => w.value === item.dayOfWeek)?.name ?? 'week'}`;
    if (item.frequency === 'biweekly') return 'Every 2 weeks';
    return `Day ${item.dayOfMonth} of month`;
  }
  if (item.frequency === 'weekly') {
    const days = [...item.daysOfWeek].sort().map((d) => WEEKDAYS.find((w) => w.value === d)?.short);
    return `Weekly · ${days.join(', ')}`;
  }
  if (item.frequency === 'biweekly') return 'Every 2 weeks';
  const days = [...item.daysOfMonth].sort((a, b) => (a === -1 ? 99 : b === -1 ? -99 : a - b)).map((d) => (d === -1 ? 'last day' : String(d)));
  if (days.length === 1) return `Monthly · ${days[0]}`;
  if (days.length === 2) return `Twice a month · ${days[0]} & ${days[1]}`;
  return `Days ${days.join(', ')}`;
}

// ---------------------------------------------------------------- dialogs

let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

/** Opens a modal <dialog> with the given content; resolves when it closes. */
export function openDialog({ title, content, actions = [], onClose }) {
  const dialog = h('dialog', { class: 'modal' });
  const close = () => dialog.close();
  const footer = h('div', { class: 'modal-actions' });
  for (const action of actions) {
    footer.append(
      h('button', {
        type: 'button',
        class: `btn ${action.kind || ''}`,
        onclick: () => {
          const result = action.run ? action.run(close) : undefined;
          if (result !== false && !action.keepOpen) close();
        },
      }, action.label),
    );
  }
  dialog.append(
    h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'modal-body' }, content),
    footer,
  );
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (onClose) onClose();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    openDialog({
      title,
      content: h('p', null, message),
      actions: [
        { label: 'Cancel', run: () => { answered = true; resolve(false); } },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', run: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------------------------------------------------------------- forms

/**
 * Builds a form from field descriptors and returns { element, values, validate }.
 * Field: { key, label, type, options, show(values), hint, placeholder, required }
 * Types: text, money (nullable number), int, date, select, check, days (multi day-of-month),
 * weekdays (multi weekday), number-select.
 */
export function buildForm(fields, values) {
  const element = h('form', { class: 'form', onsubmit: (e) => e.preventDefault() });
  const rows = [];

  const rerenderVisibility = () => {
    for (const { field, row } of rows) row.hidden = field.show ? !field.show(values) : false;
  };

  for (const field of fields) {
    const row = h('div', { class: `field field-${field.type}` });
    const label = h('label', null, field.label);
    let control;

    switch (field.type) {
      case 'text':
        control = h('input', { type: 'text', value: values[field.key] ?? '', placeholder: field.placeholder || '', oninput: (e) => { values[field.key] = e.target.value; } });
        break;
      case 'money': {
        const initial = values[field.key];
        control = h('input', {
          type: 'text', inputmode: 'decimal', placeholder: field.placeholder || '0.00', autocomplete: 'off',
          value: initial == null || (initial === 0 && field.emptyZero !== false) ? '' : String(initial),
          onfocus: (e) => e.target.select(),
          oninput: (e) => { values[field.key] = parseMoney(e.target.value); },
        });
        break;
      }
      case 'int':
        control = h('input', { type: 'number', min: field.min ?? 0, max: field.max, step: 1, value: values[field.key] ?? '', oninput: (e) => { values[field.key] = e.target.value === '' ? null : Number(e.target.value); } });
        break;
      case 'date':
        control = h('input', { type: 'date', value: values[field.key] ?? '', oninput: (e) => { values[field.key] = e.target.value || null; rerenderVisibility(); } });
        break;
      case 'select':
      case 'number-select':
        control = h('select', {
          onchange: (e) => {
            values[field.key] = field.type === 'number-select' ? Number(e.target.value) : e.target.value;
            rerenderVisibility();
          },
        }, field.options.map((o) => h('option', { value: o.value, selected: String(values[field.key]) === String(o.value) }, o.label)));
        break;
      case 'check':
        control = h('input', { type: 'checkbox', checked: !!values[field.key], onchange: (e) => { values[field.key] = e.target.checked; rerenderVisibility(); } });
        row.classList.add('inline');
        break;
      case 'days': {
        const grid = h('div', { class: 'chips' });
        const options = [...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), { value: -1, label: 'Last' }];
        for (const option of options) {
          const chip = h('button', {
            type: 'button', class: `chip ${values[field.key].includes(option.value) ? 'on' : ''}`,
            onclick: () => {
              const set = new Set(values[field.key]);
              if (set.has(option.value)) set.delete(option.value); else set.add(option.value);
              values[field.key] = [...set];
              chip.classList.toggle('on', set.has(option.value));
            },
          }, option.label);
          grid.append(chip);
        }
        control = grid;
        break;
      }
      case 'weekdays': {
        const grid = h('div', { class: 'chips' });
        for (const day of WEEKDAYS) {
          const chip = h('button', {
            type: 'button', class: `chip wide ${values[field.key].includes(day.value) ? 'on' : ''}`,
            onclick: () => {
              const set = new Set(values[field.key]);
              if (set.has(day.value)) set.delete(day.value); else set.add(day.value);
              values[field.key] = [...set];
              chip.classList.toggle('on', set.has(day.value));
            },
          }, day.short);
          grid.append(chip);
        }
        control = grid;
        break;
      }
      default:
        throw new Error(`Unknown field type ${field.type}`);
    }

    if (field.type === 'check') row.append(control, label);
    else row.append(label, control);
    if (field.hint) row.append(h('p', { class: 'hint' }, typeof field.hint === 'function' ? field.hint(values) : field.hint));
    rows.push({ field, row });
    element.append(row);
  }
  rerenderVisibility();
  return { element, values };
}

/** A modal form: shows fields, validates on Save, optional Delete. */
export function formDialog({ title, fields, values, onSave, onDelete, deleteLabel = 'Delete', saveLabel = 'Save', validate }) {
  const form = buildForm(fields, values);
  const error = h('p', { class: 'form-error', hidden: true });
  const actions = [];
  if (onDelete) {
    actions.push({
      label: deleteLabel, kind: 'danger left',
      run: () => { onDelete(); },
    });
  }
  actions.push({ label: 'Cancel' });
  actions.push({
    label: saveLabel, kind: 'primary', keepOpen: true,
    run: (close) => {
      const problem = validate ? validate(values) : null;
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        return false;
      }
      onSave(values);
      close();
    },
  });
  return openDialog({ title, content: [form.element, error], actions });
}

// Data model, persistence and import of the iOS app's JSON export.
// PUBLIC DEMO: data lives only in this browser (localStorage) and starts from fictional sample data.

import { D } from './engine.js';
import { demoData } from './demo-data.js';

const KEY = 'cashflow-demo-v1';
const storage = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export const EMPTY_DATA = () => ({
  version: 1,
  settings: {
    minBalanceThreshold: 0,
    forecastHorizonDays: 90,
    estimationMethod: 'twelveMonthAverage',
    treatFederalHolidaysAsNonBusinessDays: false,
    currencyCode: 'USD',
  },
  cards: [],
  payments: [],
  incomes: [],
  balances: [],
  manual: [],
});

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Fills in anything a hand-edited or older file might be missing. */
export function normalize(raw) {
  const base = EMPTY_DATA();
  const data = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
  data.cards = (data.cards || []).map((c) => ({ nickname: null, colorHex: '#4A90D9', expectedMonthlyAmount: null, dueDateAdjustment: 'noAdjustment', isActive: true, ...c, statements: c.statements || [] }));
  data.payments = (data.payments || []).map((p) => ({ frequency: 'monthly', dayOfMonth: 1, dayOfWeek: 1, category: 'other', endDate: null, isActive: true, adjustment: 'noAdjustment', ...p, overrides: p.overrides || [] }));
  data.incomes = (data.incomes || []).map((i) => ({ frequency: 'monthly', daysOfMonth: [], daysOfWeek: [], biweeklyAnchor: D.today(), earlyAvailabilityBusinessDays: 0, isActive: true, adjustment: 'previousBusinessDay', ...i, overrides: i.overrides || [] }));
  data.balances = data.balances || [];
  data.manual = data.manual || [];
  return data;
}

// ---------------------------------------------------------------- iOS export import

/**
 * Converts the iOS app's "Export as JSON" file (ExportBundle) into this app's format. The iOS
 * dates are instants at local midnight, so they become the local civil date; amounts are
 * Decimal-encoded numbers.
 */
export function convertIOSExport(bundle) {
  const day = (value) => (value == null ? null : D.fromTimestamp(value));
  const num = (value) => (value == null ? null : Number(value));
  const data = EMPTY_DATA();

  const s = bundle.settings || {};
  data.settings = {
    minBalanceThreshold: num(s.minBalanceThreshold) ?? 0,
    forecastHorizonDays: s.forecastHorizonDays ?? 90,
    estimationMethod: s.estimationMethod ?? 'twelveMonthAverage',
    treatFederalHolidaysAsNonBusinessDays: !!s.treatFederalHolidaysAsNonBusinessDays,
    currencyCode: s.currencyCode ?? 'USD',
  };

  data.cards = (bundle.cards || []).map((c) => ({
    id: c.id.toLowerCase(),
    name: c.name,
    nickname: c.nickname ?? null,
    colorHex: c.colorHex,
    statementDay: c.statementDay,
    paymentDueDay: c.paymentDueDay,
    expectedMonthlyAmount: num(c.expectedMonthlyAmount),
    dueDateAdjustment: c.dueDateAdjustment,
    isActive: c.isActive,
    statements: (c.statementHistory || []).map((h) => ({
      id: h.id.toLowerCase(),
      statementDate: day(h.statementDate),
      amount: num(h.amount),
      enteredAt: h.enteredAt,
      source: h.source,
    })),
  }));

  data.payments = (bundle.recurringPayments || []).map((p) => ({
    id: p.id.toLowerCase(),
    name: p.name,
    amount: num(p.amount),
    frequency: p.frequency,
    dayOfMonth: p.dayOfMonth,
    dayOfWeek: p.dayOfWeek,
    category: p.category,
    startDate: day(p.startDate),
    endDate: day(p.endDate),
    isActive: p.isActive,
    adjustment: p.adjustment,
    overrides: (p.overrides || []).map((o) => ({
      id: o.id.toLowerCase(),
      scheduledUnadjustedDate: day(o.scheduledUnadjustedDate),
      amountOverride: num(o.amountOverride),
      isPaid: o.isPaid,
    })),
  }));

  data.incomes = (bundle.incomeSources || []).map((i) => ({
    id: i.id.toLowerCase(),
    name: i.name,
    amount: num(i.amount),
    frequency: i.frequency,
    daysOfMonth: i.daysOfMonth || [],
    daysOfWeek: i.daysOfWeek || [],
    biweeklyAnchor: day(i.biweeklyAnchor) ?? D.today(),
    earlyAvailabilityBusinessDays: i.earlyAvailabilityBusinessDays ?? 0,
    isActive: i.isActive,
    adjustment: i.adjustment,
    overrides: (i.overrides || []).map((o) => ({
      id: o.id.toLowerCase(),
      scheduledUnadjustedDate: day(o.scheduledUnadjustedDate),
      amountOverride: num(o.amountOverride),
      isReceived: o.isReceived,
    })),
  }));

  data.balances = (bundle.balanceSnapshots || []).map((b) => ({
    id: b.id.toLowerCase(),
    asOfDate: day(b.asOfDate),
    amount: num(b.amount),
    enteredAt: b.enteredAt,
  }));

  data.manual = (bundle.manualTransactions || []).map((t) => ({
    id: t.id.toLowerCase(),
    note: t.note,
    amount: num(t.amount),
    date: day(t.date),
    createdAt: t.createdAt,
  }));

  return normalize(data);
}

export function looksLikeIOSExport(json) {
  return json && Array.isArray(json.recurringPayments) && Array.isArray(json.incomeSources);
}

// ---------------------------------------------------------------- store

const listeners = new Set();
const statusListeners = new Set();

export const store = {
  data: EMPTY_DATA(),
  rev: 0,
  isEmpty: true,
  status: { state: 'idle', message: '' }, // idle | saving | saved | error | conflict
  sync: null,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  subscribeStatus(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },

  emit() {
    listeners.forEach((fn) => fn());
  },

  emitStatus() {
    statusListeners.forEach((fn) => fn());
  },

  async load() {
    const saved = storage.get();
    let data = null;
    if (saved) { try { data = JSON.parse(saved); } catch { data = null; } }
    this.data = data ? normalize(data) : demoData();
    this.isEmpty = false;
    this.emit();
  },

  /** Throws away the visitor's edits and starts again from the sample data. */
  resetDemo() {
    storage.clear();
    this.data = demoData();
    this.isEmpty = false;
    this.status = { state: 'idle', message: '' };
    this.emit();
    this.emitStatus();
  },

  /** Applies a change and persists the whole document. */
  change(mutator) {
    mutator(this.data);
    this.isEmpty = false;
    this.emit();
    this.scheduleSave();
  },

  replace(data) {
    this.data = normalize(data);
    this.isEmpty = false;
    this.emit();
    this.scheduleSave();
  },

  _timer: null,
  _saving: false,
  _dirty: false,

  scheduleSave() {
    this._dirty = true;
    this.status = { state: 'saving', message: 'Saving…' };
    this.emitStatus();
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  },

  async flush() {
    if (!this._dirty) return;
    this._dirty = false;
    const ok = storage.set(JSON.stringify(this.data));
    this.status = ok ? { state: 'saved', message: 'Saved in this browser' } : { state: 'saved', message: 'Changes kept until you leave' };
    this.emitStatus();
  },

  async refreshSync() {
    this.sync = null;
  },
};

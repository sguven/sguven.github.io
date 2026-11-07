// The screens. Each view is a function returning a DOM element; the router re-renders on change.

import {
  D, Month, paymentMonth, buildDashboard, buildPaymentReport, occurrenceRows, displayName,
} from './engine.js';
import { store, uuid, convertIOSExport, looksLikeIOSExport, normalize, EMPTY_DATA } from './store.js';
import {
  h, money, fmtDate, fmtDay, fmtShort, fmtMonth, WEEKDAYS, ADJUSTMENTS, CATEGORIES, ordinal, scheduleText,
  openDialog, confirmDialog, formDialog, toast,
} from './ui.js';
import { balanceChart, paymentsChart } from './charts.js';

const nowIso = () => new Date().toISOString();
const page = (title, actions, ...body) => h('section', { class: 'page' },
  h('div', { class: 'page-title' }, h('h1', null, title), h('div', { class: 'toolbar' }, actions)),
  h('div', { style: { display: 'grid', gap: '16px', marginTop: '16px' } }, body));
/** A data table: header labels plus rows laid out on one CSS grid (`cols`, with `colsSm` on phones). */
const table = (cols, headers, rows, colsSm) => h('div', { class: 'tbl', style: { '--cols': cols, '--cols-sm': colsSm || cols } },
  h('div', { class: 'thead' }, headers.map(([label, cls]) => h('div', { class: cls || '' }, label))),
  rows);
const trow = (onclick, ...cells) => h('div', { class: `trow ${onclick ? 'clickable' : ''}`, onclick }, cells.map((c) => (c instanceof Node ? c : h('div', { class: 'cell' }, c))));
const cell = (cls, ...content) => h('div', { class: `cell ${cls || ''}` }, content);
const TYPE_LABEL = { income: 'Income', cardPayment: 'Card', recurringPayment: 'Payment', manual: 'Adjustment' };
const go = (hash) => () => { location.hash = hash; };
const empty = (title, text) => h('div', { class: 'empty' }, h('h3', null, title), h('div', null, text));
const amountClass = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
const catIcon = (value) => CATEGORIES.find((c) => c.value === value)?.icon ?? '💳';
const EVENT_ICON = { income: '⬇️', cardPayment: '💳', recurringPayment: '📅', manual: '✏️' };
/** Where a dashboard event links to: the card, payment or income it came from. */
const EVENT_TARGET = {
  cardPayment: (e) => `#/cards/${e.sourceId}`,
  recurringPayment: (e) => `#/payments/${e.sourceId}`,
  income: (e) => `#/income/${e.sourceId}`,
};
const EVENT_COLOR = { income: 'var(--income)', cardPayment: 'var(--brand)', recurringPayment: 'var(--expense)', manual: 'var(--estimate)' };

// ================================================================ dashboard

export function dashboardView() {
  const data = store.data;
  const today = D.today();
  const dash = buildDashboard(data, today);
  const { summary } = dash;
  const hasAnyData = data.cards.length || data.payments.length || data.incomes.length;

  const hero = h('div', { class: 'card hero' },
    h('div', null,
      h('div', { class: 'label' }, 'Balance Today'),
      summary.currentBalance == null
        ? h('div', { class: 'value', style: { fontSize: '22px' } }, 'Enter your balance to begin')
        : h('div', { class: 'value' }, money(summary.currentBalance)),
      summary.enteredBalance != null && h('div', { class: 'sub' },
        summary.enteredBalanceDate === today ? 'Entered today' : `From ${money(summary.enteredBalance)} entered ${fmtDate(summary.enteredBalanceDate)}`),
    ),
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn', onclick: () => balanceDialog() }, 'Update Balance'),
      h('button', { class: 'btn', onclick: () => manualDialog(null) }, '± Adjust'),
    ),
  );

  if (!hasAnyData && store.data.balances.length === 0) {
    return page('Dashboard', null, hero, h('div', { class: 'card' }, empty('Nothing here yet', 'Add income, payments and cards, or import your iOS export in Settings.')));
  }

  const readout = h('div', { class: 'readout' });
  const showReadout = (day) => {
    readout.replaceChildren();
    if (day) {
      const events = day.events.map((e) => `${e.label} ${money(e.amount, { signed: true })}`).join(' · ');
      readout.append(
        h('div', { class: 'muted small' }, fmtDay(day.date)),
        h('div', { class: `big ${day.endingBalance < data.settings.minBalanceThreshold ? 'neg' : ''}` }, money(day.endingBalance)),
        h('div', { class: 'small muted one-line' }, events || 'No events'),
      );
    } else {
      readout.append(h('div', { class: 'muted small', style: { fontWeight: 600 } }, 'PROJECTED BALANCE'), h('div', { class: 'big muted' }, '\u00a0'), h('div', { class: 'small muted one-line' }, 'Hover or touch the chart for a day'));
    }
  };
  showReadout(null);
  const chartCard = h('div', { class: 'card' }, readout,
    h('div', { class: 'chart-wrap' }, balanceChart({ days: dash.days, threshold: data.settings.minBalanceThreshold, onSelect: showReadout })));

  const nextCard = h('div', { class: 'card' }, h('h2', null, 'Next Payments'),
    summary.nextPayments.length === 0 ? empty('Nothing due', 'No payments in the forecast horizon.') :
      h('ul', { class: 'list' }, summary.nextPayments.map((e) => h('li', { class: 'row clickable', onclick: go(EVENT_TARGET[e.kind](e)) },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, e.label), h('div', { class: 'small muted' }, fmtShort(e.date))),
        e.isEstimate && h('span', { class: 'tag' }, 'EST'),
        h('span', { class: 'amount neg' }, money(e.amount))))));

  const pending = summary.pendingStatements.length === 0 ? null : h('div', { class: 'card' },
    h('h2', null, 'Pending Statements'),
    h('ul', { class: 'list' }, summary.pendingStatements.map(({ card, statementDate }) => h('li', { class: 'row' },
      h('span', { class: 'color-dot', style: { background: card.colorHex } }),
      h('div', { class: 'grow' }, h('a', { class: 'title link', href: `#/cards/${card.id}` }, displayName(card)), h('div', { class: 'small muted' }, `Statement ${fmtDate(statementDate)}`)),
      h('button', { class: 'btn small', onclick: () => statementDialog(card, null, statementDate) }, 'Enter'),
    ))));

  const stats = [
    stat('Lowest Projected', summary.lowestBalance != null ? money(summary.lowestBalance) : '—',
      summary.lowestBalanceDate ? fmtDate(summary.lowestBalanceDate) : '',
      (summary.lowestBalance ?? 0) < data.settings.minBalanceThreshold ? 'neg' : ''),
    stat('Next Income', summary.nextIncome ? money(summary.nextIncome.amount) : '—', summary.nextIncome ? `${summary.nextIncome.label} · ${fmtDate(summary.nextIncome.date)}` : '', 'pos'),
    stat('Next Payment', summary.nextPayments[0] ? money(-summary.nextPayments[0].amount) : '—', summary.nextPayments[0] ? `${summary.nextPayments[0].label} · ${fmtDate(summary.nextPayments[0].date)}` : '', 'neg'),
  ];

  return page('Dashboard', null,
    h('div', { class: 'grid dash-top' }, hero, ...stats),
    h('div', { class: 'grid dash-mid' }, chartCard, h('div', { class: 'stack' }, pending, nextCard)),
    eventsCard(dash.events.filter((e) => !(e.kind === 'manual' && e.date < today)), today, dash.days));
}

const stat = (title, value, sub, cls) => h('div', { class: 'card stat' }, h('div', { class: 't' }, title), h('div', { class: `v ${cls}` }, value), h('div', { class: 's' }, sub));

function eventsCard(events, today, days) {
  if (events.length === 0) return h('div', { class: 'card' }, empty('No upcoming events', 'Nothing is scheduled in the forecast horizon.'));
  const balanceOn = new Map(days.map((d) => [d.date, d.endingBalance]));
  const groups = new Map();
  for (const e of events) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  const rows = [];
  for (const date of [...groups.keys()].sort()) {
    const list = groups.get(date).sort((a, b) => (a.label < b.label ? -1 : 1));
    list.forEach((e, i) => {
      const isManual = e.kind === 'manual';
      const target = EVENT_TARGET[e.kind]?.(e);
      const open = isManual ? () => manualDialog(store.data.manual.find((t) => t.id === e.id)) : target ? go(target) : null;
      rows.push(trow(open,
        cell(`date ${i === 0 ? '' : 'faint'}`, i === 0 ? fmtShort(date) : '', i === 0 && date === today && h('span', { class: 'tag today' }, 'TODAY')),
        cell('', h('span', { class: 'dot', style: { '--c': EVENT_COLOR[e.kind] } }), h('span', { class: `name ${target ? 'link-text' : ''}` }, e.label),
          e.wasAdjusted && h('span', { class: 'small muted' }, ` · adjusted from ${fmtShort(e.unadjustedDate)}`),
          e.isEstimate && h('span', { class: 'tag' }, 'EST'), e.isPaidOrReceived && h('span', { class: 'check' }, ' ✓')),
        cell('hide-sm muted', TYPE_LABEL[e.kind]),
        cell(`num ${amountClass(e.amount)}`, money(e.amount, { signed: true })),
        cell('num muted hide-sm', i === list.length - 1 && balanceOn.has(date) ? money(balanceOn.get(date)) : ''),
      ));
    });
  }
  return h('div', { class: 'card' }, h('h2', null, 'Upcoming'),
    table('130px 1fr 100px 120px 130px', [['Date'], ['Description'], ['Type', 'hide-sm'], ['Amount', 'num'], ['Balance after', 'num hide-sm']], rows, '110px 1fr 110px'));
}

// ---------------------------------------------------------------- dashboard dialogs

export function balanceDialog() {
  const latest = [...store.data.balances].sort((a, b) => (a.asOfDate < b.asOfDate ? -1 : 1)).at(-1);
  formDialog({
    title: 'Update Balance',
    values: { asOfDate: D.today(), amount: null },
    fields: [
      { key: 'asOfDate', label: 'As of', type: 'date', hint: 'The balance is treated as the end of this day.' },
      { key: 'amount', label: `Checking balance${latest ? ` (last: ${money(latest.amount)})` : ''}`, type: 'money' },
    ],
    validate: (v) => (v.amount == null ? 'Enter an amount.' : !v.asOfDate ? 'Pick a date.' : null),
    onSave: (v) => store.change((d) => d.balances.push({ id: uuid(), asOfDate: v.asOfDate, amount: v.amount, enteredAt: nowIso() })),
  });
}

export function manualDialog(transaction) {
  const values = transaction
    ? { direction: transaction.amount < 0 ? 'out' : 'in', amount: Math.abs(transaction.amount), date: transaction.date, note: transaction.note }
    : { direction: 'out', amount: null, date: D.today(), note: '' };
  formDialog({
    title: transaction ? 'Edit Adjustment' : 'Adjust Balance',
    values,
    fields: [
      { key: 'direction', label: 'Type', type: 'select', options: [{ value: 'out', label: 'Money out' }, { value: 'in', label: 'Money in' }] },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'note', label: 'Note (optional)', type: 'text', placeholder: 'e.g. Cash, refund, transfer' },
    ],
    validate: (v) => (!v.amount || v.amount <= 0 ? 'Enter an amount greater than zero.' : !v.date ? 'Pick a date.' : null),
    onSave: (v) => store.change((d) => {
      const amount = v.direction === 'out' ? -Math.abs(v.amount) : Math.abs(v.amount);
      if (transaction) Object.assign(d.manual.find((t) => t.id === transaction.id), { amount, date: v.date, note: v.note.trim() });
      else d.manual.push({ id: uuid(), note: v.note.trim(), amount, date: v.date, createdAt: nowIso() });
    }),
    onDelete: transaction ? () => store.change((d) => { d.manual = d.manual.filter((t) => t.id !== transaction.id); }) : null,
  });
}

export function statementDialog(card, statement, defaultDate) {
  formDialog({
    title: `${statement ? 'Edit' : 'Add'} Statement · ${displayName(card)}`,
    values: { statementDate: statement?.statementDate ?? defaultDate ?? D.today(), amount: statement?.amount ?? null },
    fields: [
      { key: 'statementDate', label: 'Statement date', type: 'date' },
      { key: 'amount', label: 'Statement balance', type: 'money' },
    ],
    validate: (v) => (v.amount == null ? 'Enter an amount.' : !v.statementDate ? 'Pick a date.' : null),
    onSave: (v) => store.change((d) => {
      const target = d.cards.find((c) => c.id === card.id);
      if (statement) Object.assign(target.statements.find((s) => s.id === statement.id), { statementDate: v.statementDate, amount: v.amount });
      else target.statements.push({ id: uuid(), statementDate: v.statementDate, amount: v.amount, enteredAt: nowIso(), source: 'manualEntry' });
    }),
    onDelete: statement ? () => store.change((d) => {
      const target = d.cards.find((c) => c.id === card.id);
      target.statements = target.statements.filter((s) => s.id !== statement.id);
    }) : null,
  });
}

// ================================================================ income

const PAY_KINDS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'twiceMonthly', label: 'Twice a month' },
  { value: 'everyTwoWeeks', label: 'Every 2 weeks' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'customDays', label: 'Custom days of month' },
];

function incomeToDraft(income) {
  const draft = {
    name: income?.name ?? '', amount: income?.amount ?? null, scheduleKind: 'twiceMonthly', firstDay: 15, secondDay: -1,
    customDays: [], daysOfWeek: [], biweeklyAnchor: income?.biweeklyAnchor ?? D.today(), early: income?.earlyAvailabilityBusinessDays ?? 0,
    isActive: income?.isActive ?? true, adjustment: income?.adjustment ?? 'previousBusinessDay',
  };
  if (income) {
    draft.daysOfWeek = [...income.daysOfWeek];
    if (income.frequency === 'biweekly') draft.scheduleKind = 'everyTwoWeeks';
    else if (income.frequency === 'weekly') draft.scheduleKind = 'weekly';
    else if (income.daysOfMonth.length === 1) { draft.scheduleKind = 'monthly'; draft.firstDay = income.daysOfMonth[0]; }
    else if (income.daysOfMonth.length === 2) { draft.scheduleKind = 'twiceMonthly'; [draft.firstDay, draft.secondDay] = income.daysOfMonth; }
    else { draft.scheduleKind = 'customDays'; draft.customDays = [...income.daysOfMonth]; }
  }
  return draft;
}

function applyIncomeDraft(target, v) {
  Object.assign(target, { name: v.name.trim(), amount: v.amount, isActive: v.isActive, adjustment: v.adjustment, earlyAvailabilityBusinessDays: v.early || 0 });
  switch (v.scheduleKind) {
    case 'monthly': Object.assign(target, { frequency: 'monthly', daysOfMonth: [v.firstDay] }); break;
    case 'twiceMonthly': Object.assign(target, { frequency: 'monthly', daysOfMonth: [v.firstDay, v.secondDay] }); break;
    case 'customDays': Object.assign(target, { frequency: 'monthly', daysOfMonth: [...v.customDays].sort((a, b) => a - b) }); break;
    case 'weekly': Object.assign(target, { frequency: 'weekly', daysOfWeek: [...v.daysOfWeek].sort() }); break;
    case 'everyTwoWeeks': Object.assign(target, { frequency: 'biweekly', biweeklyAnchor: v.biweeklyAnchor }); break;
  }
}

const dayOptions = [...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })), { value: -1, label: 'Last day' }];

export function incomeDialog(income) {
  const values = incomeToDraft(income);
  formDialog({
    title: income ? 'Edit Income' : 'New Income',
    values,
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Salary' },
      { key: 'amount', label: 'Amount per paycheck', type: 'money' },
      { key: 'scheduleKind', label: 'Pay schedule', type: 'select', options: PAY_KINDS },
      { key: 'firstDay', label: 'Day of month', type: 'number-select', options: dayOptions, show: (v) => v.scheduleKind === 'monthly' || v.scheduleKind === 'twiceMonthly' },
      { key: 'secondDay', label: 'Second day', type: 'number-select', options: dayOptions, show: (v) => v.scheduleKind === 'twiceMonthly' },
      { key: 'customDays', label: 'Days of month', type: 'days', show: (v) => v.scheduleKind === 'customDays' },
      { key: 'daysOfWeek', label: 'Weekday(s)', type: 'weekdays', show: (v) => v.scheduleKind === 'weekly' },
      { key: 'biweeklyAnchor', label: 'A known payday', type: 'date', show: (v) => v.scheduleKind === 'everyTwoWeeks', hint: 'Every second week from this date, in both directions.' },
      { key: 'adjustment', label: 'If payday is a weekend/holiday', type: 'select', options: ADJUSTMENTS },
      { key: 'early', label: 'Available business days early', type: 'int', min: 0, max: 5, hint: 'e.g. 2 = money is in your account 2 business days before payday.' },
      { key: 'isActive', label: 'Active', type: 'check' },
    ],
    validate: (v) => {
      if (!v.name.trim()) return 'Enter a name.';
      if (v.amount == null) return 'Enter an amount.';
      if (v.scheduleKind === 'twiceMonthly' && v.firstDay === v.secondDay) return 'Pick two different days.';
      if (v.scheduleKind === 'weekly' && v.daysOfWeek.length === 0) return 'Pick at least one weekday.';
      if (v.scheduleKind === 'customDays' && v.customDays.length === 0) return 'Pick at least one day.';
      return null;
    },
    onSave: (v) => store.change((d) => {
      if (income) applyIncomeDraft(d.incomes.find((i) => i.id === income.id), v);
      else { const created = { id: uuid(), overrides: [] }; applyIncomeDraft(created, v); d.incomes.push(created); }
    }),
    onDelete: income ? () => deleteWithConfirm('income source', income.name, () => store.change((d) => { d.incomes = d.incomes.filter((i) => i.id !== income.id); }), '#/income') : null,
  });
}

async function deleteWithConfirm(kind, name, run, goTo) {
  if (await confirmDialog({ title: `Delete ${kind}?`, message: `“${name}” and its history will be removed.` })) {
    run();
    if (goTo) location.hash = goTo;
  }
}

export function incomeListView() {
  const incomes = store.data.incomes;
  return page('Income', h('button', { class: 'btn primary', onclick: () => incomeDialog(null) }, '+ Add Income'),
    h('div', { class: 'card' }, incomes.length === 0 ? empty('No income yet', 'Add a paycheck to include it in the forecast.') :
      table('1.2fr 1.6fr 1fr 120px 70px', [['Name'], ['Schedule'], ['Available', 'hide-sm'], ['Amount', 'num'], ['Status', 'hide-sm']],
        incomes.map((i) => trow(go(`#/income/${i.id}`),
          cell('strong', i.name),
          cell('muted', scheduleText(i, 'income')),
          cell('muted hide-sm', i.earlyAvailabilityBusinessDays > 0 ? `${i.earlyAvailabilityBusinessDays} business day${i.earlyAvailabilityBusinessDays > 1 ? 's' : ''} early` : 'On payday'),
          cell('num pos', money(i.amount)),
          cell('hide-sm', h('span', { class: `tag ${i.isActive ? 'ok' : 'off'}` }, i.isActive ? 'ACTIVE' : 'OFF'))
        )), '1fr 100px')));
}

export function incomeDetailView(id) {
  const income = store.data.incomes.find((i) => i.id === id);
  if (!income) return notFound('#/income');
  return itemDetail(income, 'income', 'Received', () => incomeDialog(income));
}

// ================================================================ payments

export function paymentDialog(payment) {
  const values = {
    name: payment?.name ?? '', amount: payment?.amount ?? null, frequency: payment?.frequency === 'biweekly' ? 'monthly' : (payment?.frequency ?? 'monthly'),
    dayOfMonth: payment?.dayOfMonth ?? 1, dayOfWeek: payment?.dayOfWeek ?? 4, category: payment?.category ?? 'other',
    startDate: payment?.startDate ?? D.today(), hasEnd: !!payment?.endDate, endDate: payment?.endDate ?? D.addDays(D.today(), 365),
    adjustment: payment?.adjustment ?? 'noAdjustment', isActive: payment?.isActive ?? true,
  };
  formDialog({
    title: payment ? 'Edit Payment' : 'New Payment',
    values,
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Rent' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon} ${c.label}` })) },
      { key: 'frequency', label: 'Repeats', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }] },
      { key: 'dayOfMonth', label: 'Day of month', type: 'number-select', options: dayOptions, show: (v) => v.frequency === 'monthly' },
      { key: 'dayOfWeek', label: 'Weekday', type: 'number-select', options: WEEKDAYS.map((w) => ({ value: w.value, label: w.name })), show: (v) => v.frequency === 'weekly' },
      { key: 'startDate', label: 'Starts', type: 'date' },
      { key: 'hasEnd', label: 'Has an end date', type: 'check' },
      { key: 'endDate', label: 'Ends', type: 'date', show: (v) => v.hasEnd },
      { key: 'adjustment', label: 'If due on a weekend/holiday', type: 'select', options: ADJUSTMENTS },
      { key: 'isActive', label: 'Active', type: 'check' },
    ],
    validate: (v) => (!v.name.trim() ? 'Enter a name.' : v.amount == null ? 'Enter an amount.' : !v.startDate ? 'Pick a start date.' : null),
    onSave: (v) => store.change((d) => {
      const fields = {
        name: v.name.trim(), amount: v.amount, frequency: v.frequency, dayOfMonth: v.dayOfMonth, dayOfWeek: v.dayOfWeek, category: v.category,
        startDate: v.startDate, endDate: v.hasEnd ? v.endDate : null, adjustment: v.adjustment, isActive: v.isActive,
      };
      if (payment) Object.assign(d.payments.find((p) => p.id === payment.id), fields);
      else d.payments.push({ id: uuid(), overrides: [], ...fields });
    }),
    onDelete: payment ? () => deleteWithConfirm('payment', payment.name, () => store.change((d) => { d.payments = d.payments.filter((p) => p.id !== payment.id); }), '#/payments') : null,
  });
}

export function paymentListView() {
  const payments = store.data.payments;
  return page('Payments', h('button', { class: 'btn primary', onclick: () => paymentDialog(null) }, '+ Add Payment'),
    h('div', { class: 'card' }, payments.length === 0 ? empty('No recurring payments', 'Add rent, subscriptions and other regular bills.') :
      table('1.2fr 1fr 1.4fr 120px 70px', [['Name'], ['Category', 'hide-sm'], ['Schedule'], ['Amount', 'num'], ['Status', 'hide-sm']],
        payments.map((p) => trow(go(`#/payments/${p.id}`),
          cell('strong', `${catIcon(p.category)} ${p.name}`),
          cell('muted hide-sm', CATEGORIES.find((c) => c.value === p.category)?.label ?? ''),
          cell('muted', scheduleText(p, 'payment')),
          cell('num', money(p.amount)),
          cell('hide-sm', h('span', { class: `tag ${p.isActive ? 'ok' : 'off'}` }, p.isActive ? 'ACTIVE' : 'OFF'))
        )), '1fr 100px')));
}

export function paymentDetailView(id) {
  const payment = store.data.payments.find((p) => p.id === id);
  if (!payment) return notFound('#/payments');
  return itemDetail(payment, 'payment', 'Paid', () => paymentDialog(payment));
}

// ---------------------------------------------------------------- shared detail (income + payment)

function itemDetail(item, kind, markedLabel, onEdit) {
  const rows = occurrenceRows(item, kind, store.data.settings, D.today());
  const collection = kind === 'income' ? 'incomes' : 'payments';
  const markKey = kind === 'income' ? 'isReceived' : 'isPaid';

  const mutate = (row, change) => store.change((d) => {
    const target = d[collection].find((x) => x.id === item.id);
    let override = target.overrides.find((o) => o.scheduledUnadjustedDate === row.scheduledUnadjustedDate);
    if (!override) {
      override = { id: uuid(), scheduledUnadjustedDate: row.scheduledUnadjustedDate, amountOverride: null, [markKey]: false };
      target.overrides.push(override);
    }
    change(override);
  });

  const editRow = (row) => {
    const values = { amount: row.isOverridden ? row.amount : null, marked: row.isMarked };
    formDialog({
      title: `${item.name} · ${fmtDate(row.adjustedDate)}`,
      values,
      fields: [
        { key: 'amount', label: `Amount (default ${money(item.amount)})`, type: 'money', hint: 'Leave empty to use the default amount.' },
        { key: 'marked', label: markedLabel, type: 'check' },
      ],
      onSave: (v) => mutate(row, (o) => { o.amountOverride = v.amount; o[markKey] = v.marked; }),
    });
  };

  const info = h('dl', { class: 'kv' },
    h('dt', null, 'Amount'), h('dd', null, money(item.amount)),
    h('dt', null, 'Schedule'), h('dd', null, scheduleText(item, kind)),
    kind === 'income' && item.earlyAvailabilityBusinessDays > 0 && [h('dt', null, 'Available'), h('dd', null, `${item.earlyAvailabilityBusinessDays} business day(s) early`)],
    kind === 'payment' && [h('dt', null, 'Starts'), h('dd', null, fmtDate(item.startDate))],
    kind === 'payment' && item.endDate && [h('dt', null, 'Ends'), h('dd', null, fmtDate(item.endDate))],
    h('dt', null, 'Active'), h('dd', null, item.isActive ? 'Yes' : 'No'),
  );

  const list = rows.length === 0 ? empty('No upcoming occurrences', 'Nothing falls inside the forecast horizon.') :
    table('1.4fr 1fr 110px 150px', [['Date'], ['Notes', 'hide-sm'], ['Amount', 'num'], ['', 'num']],
      rows.map((row) => trow(() => editRow(row),
        cell('', h('span', { class: 'name' }, fmtDay(row.adjustedDate)), row.wasAdjusted && h('div', { class: 'small muted' }, `Adjusted from ${fmtShort(row.scheduledUnadjustedDate)}`)),
        cell('hide-sm', row.isOverridden && h('span', { class: 'tag' }, 'CUSTOM'), row.isMarked && h('span', { class: 'check' }, ` ✓ ${markedLabel}`)),
        cell(`num ${kind === 'income' ? 'pos' : ''}`, money(row.amount)),
        cell('num', h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); mutate(row, (o) => { o[markKey] = !row.isMarked; }); } }, row.isMarked ? 'Unmark' : `Mark ${markedLabel.toLowerCase()}`)),
      )), '1fr 110px 130px');

  return page(item.name, [
    h('a', { class: 'btn', href: kind === 'income' ? '#/income' : '#/payments' }, '← Back'),
    h('button', { class: 'btn primary', onclick: onEdit }, 'Edit'),
  ], h('div', { class: 'grid detail' }, h('div', { class: 'card' }, h('h2', null, 'Details'), info), h('div', { class: 'card' }, h('h2', null, 'Upcoming Occurrences'), list)));
}

const notFound = (back) => page('Not found', h('a', { class: 'btn', href: back }, '← Back'), h('div', { class: 'card' }, empty('Not found', 'That item no longer exists.')));

// ================================================================ cards

export function cardDialog(card) {
  const values = {
    name: card?.name ?? '', nickname: card?.nickname ?? '', colorHex: card?.colorHex ?? '#4A90D9', statementDay: card?.statementDay ?? 1,
    paymentDueDay: card?.paymentDueDay ?? 15, hasExpected: card?.expectedMonthlyAmount != null, expected: card?.expectedMonthlyAmount ?? null,
    dueDateAdjustment: card?.dueDateAdjustment ?? 'noAdjustment', isActive: card?.isActive ?? true,
  };
  const days = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) }));
  formDialog({
    title: card ? 'Edit Card' : 'New Card',
    values,
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Amex' },
      { key: 'nickname', label: 'Nickname (optional)', type: 'text' },
      { key: 'statementDay', label: 'Statement day', type: 'number-select', options: days },
      { key: 'paymentDueDay', label: 'Payment due day', type: 'number-select', options: days },
      { key: 'dueDateAdjustment', label: 'If due on a weekend/holiday', type: 'select', options: ADJUSTMENTS },
      { key: 'hasExpected', label: 'Set an expected monthly amount', type: 'check', hint: 'Used until there is statement history to average.' },
      { key: 'expected', label: 'Expected monthly amount', type: 'money', show: (v) => v.hasExpected },
      { key: 'isActive', label: 'Active', type: 'check' },
    ],
    validate: (v) => (!v.name.trim() ? 'Enter a name.' : null),
    onSave: (v) => store.change((d) => {
      const fields = {
        name: v.name.trim(), nickname: v.nickname.trim() || null, statementDay: v.statementDay, paymentDueDay: v.paymentDueDay,
        expectedMonthlyAmount: v.hasExpected ? v.expected : null, dueDateAdjustment: v.dueDateAdjustment, isActive: v.isActive,
      };
      if (card) Object.assign(d.cards.find((c) => c.id === card.id), fields);
      else d.cards.push({ id: uuid(), colorHex: v.colorHex, statements: [], ...fields });
    }),
    onDelete: card ? () => deleteWithConfirm('card', displayName(card), () => store.change((d) => { d.cards = d.cards.filter((c) => c.id !== card.id); }), '#/cards') : null,
  });
}

export function cardListView() {
  const cards = store.data.cards;
  const current = D.today().slice(0, 7);
  const averages = buildPaymentReport(cards).averageByCard(12, current);
  return page('Cards', [
    cards.length > 0 && h('a', { class: 'btn', href: '#/cards/report' }, '📊 Payments by Month'),
    h('button', { class: 'btn primary', onclick: () => cardDialog(null) }, '+ Add Card'),
  ],
  h('div', { class: 'card' }, cards.length === 0 ? empty('No cards', 'Add a credit card to track statement balances.') :
    table('1.4fr 1.2fr 130px 130px 70px', [['Card'], ['Cycle', 'hide-sm'], ['12-mo average', 'num hide-sm'], ['Latest statement', 'num'], ['Status', 'hide-sm']],
      cards.map((c) => {
        const latest = [...c.statements].sort((a, b) => (a.statementDate < b.statementDate ? 1 : -1))[0];
        const avg = averages.get(displayName(c));
        return trow(go(`#/cards/${c.id}`),
          cell('strong', h('span', { class: 'color-dot', style: { background: c.colorHex } }), ' ', displayName(c)),
          cell('muted hide-sm', `Statement ${ordinal(c.statementDay)} · due ${ordinal(c.paymentDueDay)}`),
          cell('num muted hide-sm', avg ? money(avg.average) : '—'),
          cell('num', latest ? money(latest.amount) : '—'),
          cell('hide-sm', h('span', { class: `tag ${c.isActive ? 'ok' : 'off'}` }, c.isActive ? 'ACTIVE' : 'OFF')));
      }), '1fr 110px')));
}

export function cardDetailView(id) {
  const card = store.data.cards.find((c) => c.id === id);
  if (!card) return notFound('#/cards');
  const history = [...card.statements].sort((a, b) => (a.statementDate < b.statementDate ? 1 : -1));
  const months = [...history].reverse().slice(-24).map((s) => ({ month: D.monthOf(s.statementDate), total: s.amount, statementDate: s.statementDate }));
  const readout = monthReadout('STATEMENT BALANCE', (m) => ({ title: `Statement ${fmtDate(m.statementDate)}`, line: `Paid in ${fmtMonth(paymentMonth(m.month, card.statementDay, card.paymentDueDay))}` }));
  const avg = buildPaymentReport([card]).averageByCard(12, D.today().slice(0, 7)).get(displayName(card));
  return page(displayName(card), [
    h('a', { class: 'btn', href: '#/cards' }, '← Back'),
    h('button', { class: 'btn primary', onclick: () => cardDialog(card) }, 'Edit'),
  ],
  h('div', { class: 'grid detail' },
    h('div', { class: 'stack' },
      h('div', { class: 'card' }, h('h2', null, 'Details'), h('dl', { class: 'kv' },
        h('dt', null, 'Statement day'), h('dd', null, String(card.statementDay)),
        h('dt', null, 'Payment due day'), h('dd', null, String(card.paymentDueDay)),
        avg && [h('dt', null, '12-month average'), h('dd', null, money(avg.average))],
        card.expectedMonthlyAmount != null && [h('dt', null, 'Expected monthly amount'), h('dd', null, money(card.expectedMonthlyAmount))],
        h('dt', null, 'Active'), h('dd', null, card.isActive ? 'Yes' : 'No'))),
    ),
    h('div', { class: 'stack' },
      months.length > 1 && h('div', { class: 'card' }, h('h2', null, 'History (by statement month)'), readout.el, h('div', { class: 'chart-wrap' }, paymentsChart({ months, line: null, currentMonth: null, onSelect: readout.show }))),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Statement Balances'), h('button', { class: 'btn small', onclick: () => statementDialog(card, null) }, '+ Add')),
        history.length === 0 ? empty('No statements yet', 'Add a statement balance to improve estimates.') :
          table('1fr 110px 120px', [['Statement date'], ['Source', 'hide-sm'], ['Amount', 'num']],
            history.map((s) => trow(() => statementDialog(card, s), cell('', fmtDate(s.statementDate)), cell('hide-sm', s.source === 'imported' ? h('span', { class: 'tag off' }, 'IMPORTED') : ''), cell('num', money(s.amount)))), '1fr 110px')))));
}

// ---------------------------------------------------------------- payments by month

/** A fixed-height readout for a payments chart; the chart calls it with the hovered month. */
function monthReadout(idle, describe) {
  const el = h('div', { class: 'chart-readout' });
  const show = (m) => {
    el.replaceChildren();
    if (!m) {
      el.append(h('div', { class: 'muted small', style: { fontWeight: 600 } }, idle), h('div', { class: 'big muted' }, '\u00a0'), h('div', { class: 'small muted one-line' }, 'Hover or touch a bar for details'));
      return;
    }
    const d = describe(m);
    el.append(h('div', { class: 'muted small' }, d.title), h('div', { class: 'big' }, money(m.total)), h('div', { class: 'small muted one-line' }, d.line));
  };
  show(null);
  return { el, show };
}

let averageLine = 0;

export function cardReportView(selectedMonth) {
  const report = buildPaymentReport(store.data.cards);
  const current = D.today().slice(0, 7);
  const months = report.months.filter((m) => m.month <= current);

  if (selectedMonth) return monthDetail(report, selectedMonth, current);
  if (months.length === 0) {
    return page('Payments by Month', h('a', { class: 'btn', href: '#/cards' }, '← Back'), h('div', { class: 'card' }, empty('No payment history', 'Enter statement balances on your cards to see monthly totals.')));
  }

  const avgCards = [3, 6, 12].map((count) => {
    const avg = report.average(count, current);
    return stat(`Last ${count} months`, avg ? money(avg.average) : '—', avg && avg.monthCount < count ? `average · ${avg.monthCount} months of data` : 'average per month');
  });

  const chartHost = h('div', { class: 'chart-wrap' });
  const readout = monthReadout('MONTHLY TOTAL', (m) => ({
    title: m.month === current ? `${fmtMonth(m.month)} · in progress` : fmtMonth(m.month),
    line: [m.average != null ? `${averageLine}-mo avg ${money(m.average)}` : null, ...m.byCard.map((c) => `${c.cardName} ${money(c.amount)}`)].filter(Boolean).join(' · '),
  }));
  const drawChart = () => {
    const visible = months.filter((m) => m.month >= Month.add(current, -11));
    readout.show(null);
    chartHost.replaceChildren(paymentsChart({ months: visible, line: averageLine ? report.rolling(averageLine) : null, currentMonth: current, onSelect: readout.show }));
  };
  const seg = h('div', { class: 'segmented' }, [[0, 'No line'], [3, '3-mo avg'], [6, '6-mo avg'], [12, '12-mo avg']].map(([value, label]) =>
    h('button', { class: value === averageLine ? 'on' : '', onclick: (e) => {
      averageLine = value;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      drawChart();
    } }, label)));
  drawChart();

  // Month x card matrix: the whole history on one screen.
  const cardNames = [...new Set(months.flatMap((m) => m.byCard.map((c) => c.cardName)))]
    .sort((a, b) => months.reduce((s, m) => s + (m.byCard.find((c) => c.cardName === b)?.amount || 0), 0) - months.reduce((s, m) => s + (m.byCard.find((c) => c.cardName === a)?.amount || 0), 0));
  const cols = `170px repeat(${cardNames.length}, minmax(80px, 1fr)) 120px`;
  const matrix = h('div', { class: 'tbl wide', style: { '--cols': cols, '--cols-sm': cols } },
    h('div', { class: 'thead' }, [h('div', null, 'Month'), ...cardNames.map((n) => h('div', { class: 'num' }, n)), h('div', { class: 'num' }, 'Total')]),
    [...months].reverse().map((m) => trow(go(`#/cards/report/${m.month}`),
      cell('strong', fmtMonth(m.month), m.month === current && h('span', { class: 'tag' }, 'NOW')),
      ...cardNames.map((n) => { const amount = m.byCard.find((c) => c.cardName === n)?.amount; return cell('num muted', amount == null ? '' : money(amount)); }),
      cell('num strong', money(m.total)))));

  return page('Payments by Month', h('a', { class: 'btn', href: '#/cards' }, '← Back'),
    h('div', { class: 'grid three' }, ...avgCards),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Last 12 Months'), seg), readout.el, chartHost,
      h('div', { class: 'pad small muted' }, 'Averages cover completed months only; the current month is left out.')),
    h('div', { class: 'card' }, h('h2', null, 'By Month'), h('div', { class: 'scroll-x' }, matrix)));
}

function monthDetail(report, monthKey, current) {
  const month = report.months.find((m) => m.month === monthKey);
  const averages = report.averageByCard(12, current);
  if (!month) return notFound('#/cards/report');
  return page(fmtMonth(monthKey), h('a', { class: 'btn', href: '#/cards/report' }, '← Back'),
    h('div', { class: 'card' }, table('1fr 140px 140px', [['Card'], ['12-mo average', 'num hide-sm'], ['Paid', 'num']],
      [...month.byCard.map((item) => trow(null, cell('strong', item.cardName), cell('num muted hide-sm', averages.get(item.cardName) ? money(averages.get(item.cardName).average) : '—'), cell('num', money(item.amount)))),
        trow(null, cell('strong', 'Total'), cell('hide-sm', ''), cell('num strong', money(month.total)))], '1fr 120px')));
}

// ================================================================ settings

export function settingsView() {
  const data = store.data;
  const s = data.settings;
  const set = (key, value) => store.change((d) => { d.settings[key] = value; });
  const select = (key, options, numeric) => h('select', { onchange: (e) => set(key, numeric ? Number(e.target.value) : e.target.value) },
    options.map((o) => h('option', { value: o.value, selected: String(s[key]) === String(o.value) }, o.label)));
  const row = (label, control, hint) => h('div', { class: 'row' }, h('div', { class: 'grow' }, label, hint && h('div', { class: 'small muted' }, hint)), control);

  const threshold = h('input', {
    type: 'text', inputmode: 'decimal', placeholder: '0.00', value: s.minBalanceThreshold ? String(s.minBalanceThreshold) : '', style: { width: '120px', textAlign: 'right' },
    onfocus: (e) => e.target.select(),
    onchange: (e) => set('minBalanceThreshold', Number(e.target.value.replace(/[^0-9.\-]/g, '')) || 0),
  });
  const holidays = h('input', { type: 'checkbox', checked: s.treatFederalHolidaysAsNonBusinessDays, onchange: (e) => set('treatFederalHolidaysAsNonBusinessDays', e.target.checked) });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => importFile(e.target.files[0]) });

  return page('Settings', null, h('div', { class: 'grid two' },
    h('div', { class: 'card' }, h('h2', null, 'Forecast'),
      row('Minimum balance threshold', threshold),
      row('Forecast horizon', select('forecastHorizonDays', [30, 90, 180, 365].map((n) => ({ value: n, label: `${n} days` })), true)),
      row('Card estimation method', select('estimationMethod', [{ value: 'twelveMonthAverage', label: '12-month average' }, { value: 'threeMonthAverage', label: '3-month average' }])),
      row('Treat US federal holidays as non-business days', holidays),
      row('Currency', select('currencyCode', ['USD', 'EUR', 'GBP', 'CAD'].map((c) => ({ value: c, label: c }))))),
    h('div', { class: 'card' }, h('h2', null, 'Data'),
      row('Import iOS app export', h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Choose JSON file…'), 'In the iPhone app: Settings › Export & Import › Export as JSON, then pick that file here. This replaces everything.'),
      row('Download a backup', h('button', { class: 'btn', onclick: downloadBackup }, 'Download JSON')),
      row('Reset demo', h('button', { class: 'btn', onclick: async () => {
        if (await confirmDialog({ title: 'Reset the demo?', message: 'Your changes are discarded and the sample data comes back.', confirmLabel: 'Reset', danger: true })) { store.resetDemo(); toast('Sample data restored'); }
      } }, 'Restore sample data'), 'This is a public demo with fictional figures. Edits are stored only in this browser.'),
      fileInput)),
  h('div', { class: 'grid two' },
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Manual Adjustments'), h('button', { class: 'btn small', onclick: () => manualDialog(null) }, '+ Add')), manualHistory(data)),
    h('div', { class: 'card' }, h('h2', null, 'Balance History'), balanceHistory(data))));
}

/** Every manual adjustment, newest first. Past ones leave the dashboard list but can be edited or deleted here. */
function manualHistory(data) {
  const list = [...data.manual].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  if (list.length === 0) return empty('No manual adjustments', 'Use “Adjust Balance” on the Dashboard.');
  return h('ul', { class: 'list' }, list.map((t) => h('li', { class: 'row clickable', onclick: () => manualDialog(t) },
    h('div', { class: 'grow' }, h('div', { class: 'title' }, t.note || (t.amount < 0 ? 'Money Out' : 'Money In')), h('div', { class: 'small muted' }, fmtDate(t.date))),
    h('span', { class: `amount ${amountClass(t.amount)}` }, money(t.amount, { signed: true })))));
}

function balanceHistory(data) {
  const list = [...data.balances].sort((a, b) => (a.asOfDate < b.asOfDate ? 1 : -1));
  if (list.length === 0) return empty('No balances entered', 'Use “Update Balance” on the Dashboard.');
  return h('ul', { class: 'list' }, list.slice(0, 30).map((b) => h('li', { class: 'row' },
    h('div', { class: 'grow' }, fmtDate(b.asOfDate)), h('span', { class: 'amount' }, money(b.amount)),
    h('button', { class: 'icon-btn', title: 'Delete', onclick: async () => {
      if (await confirmDialog({ title: 'Delete balance?', message: `${money(b.amount)} on ${fmtDate(b.asOfDate)}` })) store.change((d) => { d.balances = d.balances.filter((x) => x.id !== b.id); });
    } }, '🗑'))));
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `cashflow-backup-${D.today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importFile(file) {
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    let data;
    if (looksLikeIOSExport(json)) data = convertIOSExport(json);
    else if (json.settings && json.cards) data = normalize(json);
    else throw new Error('This does not look like a CashFlow export.');
    const summary = `${data.cards.length} cards, ${data.payments.length} payments, ${data.incomes.length} income sources, ${data.balances.length} balances`;
    if (!(await confirmDialog({ title: 'Replace all data?', message: `Import ${summary}. Your current data will be replaced.`, confirmLabel: 'Replace', danger: true }))) return;
    store.replace(data);
    toast('Imported ' + summary);
  } catch (error) {
    toast(`Import failed: ${error.message}`);
  }
}

export { EMPTY_DATA, openDialog, ADJUSTMENTS };

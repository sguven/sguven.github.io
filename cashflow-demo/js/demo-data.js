// Fictional sample data for the public demo. Every name and amount here is made up; dates are
// generated relative to today so the forecast always looks current.

import { D } from './engine.js';
import { EMPTY_DATA, normalize } from './store.js';

let seq = 0;
const id = (prefix) => `${prefix}-${String(++seq).padStart(4, '0')}`;

/** First day of the month `offset` months from today's month, as "YYYY-MM-DD" with the given day. */
function monthDay(offset, day) {
  const { y, m } = D.parse(D.today());
  const idx = (y * 12 + (m - 1)) + offset;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return D.fmt(yy, mm, Math.min(day, D.daysInMonth(yy, mm)));
}

/** Twelve past statements around a base amount, with a gentle wobble. */
function statements(statementDay, base, wobble) {
  const today = D.today();
  const list = [];
  for (let k = 12; k >= 0; k -= 1) {
    const date = monthDay(-k, statementDay);
    if (date > today) continue;
    const swing = Math.sin(k * 1.7 + base) * wobble;
    list.push({ id: id('st'), statementDate: date, amount: Math.round((base + swing) * 100) / 100, enteredAt: `${date}T09:00:00Z`, source: 'imported' });
  }
  return list;
}

export function demoData() {
  seq = 0;
  const today = D.today();
  const yearAgo = D.addDays(today, -400);
  const data = EMPTY_DATA();

  data.settings = {
    minBalanceThreshold: 15000,
    forecastHorizonDays: 90,
    estimationMethod: 'twelveMonthAverage',
    treatFederalHolidaysAsNonBusinessDays: true,
    currencyCode: 'USD',
  };

  data.incomes = [
    { id: id('in'), name: 'Salary', amount: 13400, frequency: 'monthly', daysOfMonth: [15, -1], earlyAvailabilityBusinessDays: 0, isActive: true, adjustment: 'previousBusinessDay', biweeklyAnchor: today },
    { id: id('in'), name: 'Rental income', amount: 4200, frequency: 'monthly', daysOfMonth: [3], earlyAvailabilityBusinessDays: 0, isActive: true, adjustment: 'nextBusinessDay', biweeklyAnchor: today },
    { id: id('in'), name: 'Consulting', amount: 1250, frequency: 'biweekly', daysOfMonth: [], daysOfWeek: [], biweeklyAnchor: monthDay(0, 6), earlyAvailabilityBusinessDays: 1, isActive: true, adjustment: 'previousBusinessDay' },
  ];

  const pay = (name, amount, dayOfMonth, category, adjustment = 'noAdjustment') => ({
    id: id('pm'), name, amount, frequency: 'monthly', dayOfMonth, dayOfWeek: 1, category, startDate: yearAgo, endDate: null, isActive: true, adjustment, overrides: [],
  });
  data.payments = [
    pay('Penthouse rent', 9800, 1, 'rent', 'nextBusinessDay'),
    pay('Car lease', 1450, 12, 'car'),
    pay('Home & auto insurance', 685, 20, 'insurance'),
    pay('Electric & gas', 420, 24, 'utilities'),
    pay('Internet & phone', 260, 8, 'utilities'),
    pay('Streaming bundle', 89, 17, 'subscription'),
    pay('Gym membership', 310, 5, 'subscription'),
    { ...pay('Groceries', 640, 1, 'other'), frequency: 'weekly', dayOfWeek: 7 },
  ];

  const card = (name, nickname, colorHex, statementDay, paymentDueDay, base, wobble) => ({
    id: id('cd'), name, nickname, colorHex, statementDay, paymentDueDay, expectedMonthlyAmount: null,
    dueDateAdjustment: 'noAdjustment', isActive: true, statements: statements(statementDay, base, wobble),
  });
  data.cards = [
    card('Sapphire Card', 'Travel', '#2E5AAC', 4, 1, 6400, 1900),
    card('Gold Card', 'Dining', '#C9A227', 18, 13, 3900, 1100),
    card('Cash Back Card', null, '#2F8F6B', 26, 21, 2200, 650),
  ];

  data.balances = [
    { id: id('bl'), asOfDate: D.addDays(today, -30), amount: 42180, enteredAt: `${D.addDays(today, -30)}T12:00:00Z` },
    { id: id('bl'), asOfDate: today, amount: 38340.25, enteredAt: `${today}T12:00:00Z` },
  ];

  data.manual = [
    { id: id('mn'), note: 'Annual vacation deposit', amount: -7500, date: D.addDays(today, 23), createdAt: `${today}T12:00:00Z` },
    { id: id('mn'), note: 'Estimated tax payment', amount: -21000, date: D.addDays(today, 47), createdAt: `${today}T12:00:00Z` },
    { id: id('mn'), note: 'Year-end bonus', amount: 24000, date: D.addDays(today, 62), createdAt: `${today}T12:00:00Z` },
  ];

  return normalize(data);
}

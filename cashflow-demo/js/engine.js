// Pure cash-flow logic: a port of the iOS app's CashFlowEngine plus the DashboardViewModel
// projection. No DOM, no network. Dates are civil "YYYY-MM-DD" strings (no time zone), amounts
// are plain numbers; display code rounds to cents.

// ---------------------------------------------------------------- civil dates

const DAY_MS = 86400000;

export const D = {
  parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
  },
  fmt(y, m, d) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },
  toMs(s) {
    const { y, m, d } = D.parse(s);
    return Date.UTC(y, m - 1, d);
  },
  fromMs(ms) {
    const dt = new Date(ms);
    return D.fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  },
  addDays(s, n) {
    return D.fromMs(D.toMs(s) + n * DAY_MS);
  },
  /** b - a in days. */
  diffDays(a, b) {
    return Math.round((D.toMs(b) - D.toMs(a)) / DAY_MS);
  },
  /** 1 = Sunday ... 7 = Saturday, like Calendar's weekday component. */
  weekday(s) {
    return new Date(D.toMs(s)).getUTCDay() + 1;
  },
  daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  },
  /** Today in the browser's local time zone. */
  today() {
    const now = new Date();
    return D.fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
  },
  /** A timestamp (ISO string or Date) as the local civil date. */
  fromTimestamp(value) {
    const dt = value instanceof Date ? value : new Date(value);
    return D.fmt(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  },
  monthOf(s) {
    return s.slice(0, 7);
  },
};

export const LAST_DAY_OF_MONTH = -1;

// ---------------------------------------------------------------- months

export const Month = {
  /** "YYYY-MM" -> sortable integer. */
  index(key) {
    const [y, m] = key.split('-').map(Number);
    return y * 12 + (m - 1);
  },
  fromIndex(i) {
    return `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
  },
  add(key, months) {
    return Month.fromIndex(Month.index(key) + months);
  },
  start(key) {
    return `${key}-01`;
  },
  parts(key) {
    const [y, m] = key.split('-').map(Number);
    return { y, m };
  },
};

/** The month a statement is paid in: same month when its day is on/before the due day. */
export function paymentMonth(statementMonth, statementDay, dueDay) {
  return statementDay <= dueDay ? statementMonth : Month.add(statementMonth, 1);
}

export function statementMonthFor(payMonth, statementDay, dueDay) {
  return statementDay <= dueDay ? payMonth : Month.add(payMonth, -1);
}

// ---------------------------------------------------------------- month-day resolver

export function resolveDate(y, m, dayOfMonth) {
  const last = D.daysInMonth(y, m);
  const day = dayOfMonth === LAST_DAY_OF_MONTH ? last : Math.min(Math.max(dayOfMonth, 1), last);
  return D.fmt(y, m, day);
}

// ---------------------------------------------------------------- holidays

const holidayCache = new Map();

function observedHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const fixed = (m, d) => D.fmt(year, m, d);
  const shift = (s) => {
    const wd = D.weekday(s);
    if (wd === 7) return D.addDays(s, -1); // Saturday -> Friday
    if (wd === 1) return D.addDays(s, 1); // Sunday -> Monday
    return s;
  };
  const nthWeekday = (n, weekday, m) => {
    const first = fixed(m, 1);
    const offset = (weekday - D.weekday(first) + 7) % 7;
    return D.addDays(first, offset + (n - 1) * 7);
  };
  const lastWeekday = (weekday, m) => {
    let cursor = fixed(m, D.daysInMonth(year, m));
    while (D.weekday(cursor) !== weekday) cursor = D.addDays(cursor, -1);
    return cursor;
  };
  const MONDAY = 2;
  const THURSDAY = 5;

  const set = new Set([
    shift(fixed(1, 1)), // New Year's Day
    nthWeekday(3, MONDAY, 1), // MLK Day
    nthWeekday(3, MONDAY, 2), // Washington's Birthday
    lastWeekday(MONDAY, 5), // Memorial Day
    shift(fixed(6, 19)), // Juneteenth
    shift(fixed(7, 4)), // Independence Day
    nthWeekday(1, MONDAY, 9), // Labor Day
    nthWeekday(2, MONDAY, 10), // Columbus Day
    shift(fixed(11, 11)), // Veterans Day
    nthWeekday(4, THURSDAY, 11), // Thanksgiving
    shift(fixed(12, 25)), // Christmas
  ]);
  holidayCache.set(year, set);
  return set;
}

export function isUSFederalHoliday(date) {
  const { y } = D.parse(date);
  // Next year's New Year's Day can be observed on Dec 31 of this year.
  return observedHolidays(y).has(date) || observedHolidays(y + 1).has(date);
}

// ---------------------------------------------------------------- business days

export class BusinessDays {
  constructor(observeHolidays) {
    this.observeHolidays = observeHolidays;
  }

  isBusinessDay(date) {
    const wd = D.weekday(date);
    if (wd === 1 || wd === 7) return false;
    return !(this.observeHolidays && isUSFederalHoliday(date));
  }

  adjust(date, rule) {
    if (rule === 'noAdjustment') return date;
    const step = rule === 'previousBusinessDay' ? -1 : 1;
    let cursor = date;
    while (!this.isBusinessDay(cursor)) cursor = D.addDays(cursor, step);
    return cursor;
  }

  subtract(count, date) {
    if (count <= 0) return date;
    let remaining = count;
    let cursor = date;
    while (remaining > 0) {
      cursor = D.addDays(cursor, -1);
      if (this.isBusinessDay(cursor)) remaining -= 1;
    }
    return cursor;
  }
}

// ---------------------------------------------------------------- recurrence

function makeBounds({ startDate, endDate, horizonStart, horizonEnd, earlyBusinessDays }) {
  const early = Math.max(earlyBusinessDays || 0, 0);
  // Scan wider than the horizon so a business-day adjustment or early availability can carry a
  // nominally out-of-horizon occurrence into it.
  const padding = 7 + early * 2;
  return {
    startDate: startDate || null,
    endDate: endDate || null,
    horizonStart,
    horizonEnd,
    early,
    scanStart: D.addDays(horizonStart, -padding),
    scanEnd: D.addDays(horizonEnd, padding),
  };
}

function occurrenceFor(unadjusted, adjustment, bounds, business) {
  if (bounds.startDate && unadjusted < bounds.startDate) return null;
  if (bounds.endDate && unadjusted > bounds.endDate) return null;
  const adjusted = business.adjust(unadjusted, adjustment);
  const effective = business.subtract(bounds.early, adjusted);
  if (effective < bounds.horizonStart || effective > bounds.horizonEnd) return null;
  return { scheduledUnadjustedDate: unadjusted, adjustedDate: effective, wasAdjusted: effective !== unadjusted };
}

const byAdjustedDate = (a, b) => (a.adjustedDate < b.adjustedDate ? -1 : a.adjustedDate > b.adjustedDate ? 1 : 0);

export function monthlyOccurrences({ daysOfMonth, startDate, endDate, adjustment, earlyBusinessDays = 0, horizonStart, horizonEnd }, business) {
  if (!daysOfMonth || daysOfMonth.length === 0) return [];
  const bounds = makeBounds({ startDate, endDate, horizonStart, horizonEnd, earlyBusinessDays });
  const results = [];
  const first = D.parse(bounds.scanStart);
  let monthKey = `${String(first.y).padStart(4, '0')}-${String(first.m).padStart(2, '0')}`;
  while (Month.start(monthKey) <= bounds.scanEnd) {
    const { y, m } = Month.parts(monthKey);
    for (const day of daysOfMonth) {
      const occ = occurrenceFor(resolveDate(y, m, day), adjustment, bounds, business);
      if (occ) results.push(occ);
    }
    monthKey = Month.add(monthKey, 1);
  }
  return results.sort(byAdjustedDate);
}

export function weeklyOccurrences({ daysOfWeek, startDate, endDate, adjustment, earlyBusinessDays = 0, horizonStart, horizonEnd }, business) {
  if (!daysOfWeek || daysOfWeek.length === 0) return [];
  const bounds = makeBounds({ startDate, endDate, horizonStart, horizonEnd, earlyBusinessDays });
  const results = [];
  for (let cursor = bounds.scanStart; cursor <= bounds.scanEnd; cursor = D.addDays(cursor, 1)) {
    if (!daysOfWeek.includes(D.weekday(cursor))) continue;
    const occ = occurrenceFor(cursor, adjustment, bounds, business);
    if (occ) results.push(occ);
  }
  return results.sort(byAdjustedDate);
}

export function biweeklyOccurrences({ anchorDate, startDate, endDate, adjustment, earlyBusinessDays = 0, horizonStart, horizonEnd }, business) {
  const bounds = makeBounds({ startDate, endDate, horizonStart, horizonEnd, earlyBusinessDays });
  const daysToScanStart = D.diffDays(anchorDate, bounds.scanStart);
  let k = Math.ceil(daysToScanStart / 14);
  const results = [];
  for (;;) {
    const date = D.addDays(anchorDate, 14 * k);
    if (date > bounds.scanEnd) break;
    const occ = occurrenceFor(date, adjustment, bounds, business);
    if (occ) results.push(occ);
    k += 1;
  }
  return results.sort(byAdjustedDate);
}

export function paymentOccurrences(payment, horizonStart, horizonEnd, business) {
  const common = { startDate: payment.startDate, endDate: payment.endDate, adjustment: payment.adjustment, horizonStart, horizonEnd };
  switch (payment.frequency) {
    case 'weekly':
      return weeklyOccurrences({ ...common, daysOfWeek: [payment.dayOfWeek] }, business);
    case 'biweekly':
      return biweeklyOccurrences({ ...common, anchorDate: payment.startDate }, business);
    default:
      return monthlyOccurrences({ ...common, daysOfMonth: [payment.dayOfMonth] }, business);
  }
}

export function incomeOccurrences(income, horizonStart, horizonEnd, business) {
  const common = {
    startDate: null,
    endDate: null,
    adjustment: income.adjustment,
    earlyBusinessDays: income.earlyAvailabilityBusinessDays || 0,
    horizonStart,
    horizonEnd,
  };
  switch (income.frequency) {
    case 'weekly':
      return weeklyOccurrences({ ...common, daysOfWeek: income.daysOfWeek }, business);
    case 'biweekly':
      return biweeklyOccurrences({ ...common, anchorDate: income.biweeklyAnchor }, business);
    default:
      return monthlyOccurrences({ ...common, daysOfMonth: income.daysOfMonth }, business);
  }
}

// ---------------------------------------------------------------- estimation

/** Average of the most recent `monthsWindow` statements, else the card's expected amount, else 0. */
export function estimateCardAmount(history, expectedMonthlyAmount, monthsWindow) {
  const recent = [...history].sort((a, b) => (a.statementDate < b.statementDate ? 1 : -1)).slice(0, monthsWindow);
  if (recent.length > 0) {
    return { amount: recent.reduce((sum, s) => sum + s.amount, 0) / recent.length, isEstimate: true };
  }
  if (expectedMonthlyAmount != null) return { amount: expectedMonthlyAmount, isEstimate: true };
  return { amount: 0, isEstimate: true };
}

export const ESTIMATION_WINDOWS = { twelveMonthAverage: 12, threeMonthAverage: 3 };

// ---------------------------------------------------------------- forecast

export function projectDays({ startingBalance, asOfDate, horizonDays, events }) {
  const byDay = new Map();
  for (const event of events) {
    if (!byDay.has(event.date)) byDay.set(event.date, []);
    byDay.get(event.date).push(event);
  }

  const days = [];
  let running = startingBalance;
  for (let offset = 0; offset < Math.max(horizonDays, 0); offset++) {
    const date = D.addDays(asOfDate, offset);
    const dayEvents = [...(byDay.get(date) || [])].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    const startingBalanceOfDay = running;
    running += dayEvents.reduce((sum, e) => sum + e.amount, 0);
    days.push({ date, startingBalance: startingBalanceOfDay, endingBalance: running, events: dayEvents });
  }
  return days;
}

// ---------------------------------------------------------------- dashboard

export const displayName = (card) => card.nickname || card.name;

/** Which statement period's balance pays a given due-date occurrence. */
function statementPeriodForDueDate(dueDate, card) {
  const month = D.monthOf(dueDate);
  return card.statementDay <= card.paymentDueDay ? month : Month.add(month, -1);
}

function pendingStatementDate(card, today) {
  const { y, m } = D.parse(today);
  let recent = resolveDate(y, m, card.statementDay);
  if (recent > today) {
    const prev = Month.parts(Month.add(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`, -1));
    recent = resolveDate(prev.y, prev.m, card.statementDay);
  }
  const target = D.monthOf(recent);
  const hasBalance = card.statements.some((s) => D.monthOf(s.statementDate) === target);
  return hasBalance ? null : recent;
}

function manualEvents(manual, latest, asOfDate, today, horizonEnd) {
  const events = [];
  for (const t of manual) {
    const day = t.date;
    if (day > horizonEnd) continue;
    if (latest) {
      const isAfter = day > asOfDate || (day === asOfDate && Date.parse(t.createdAt) > Date.parse(latest.enteredAt));
      if (!isAfter) continue;
    } else if (day < today) {
      continue;
    }
    events.push({
      id: t.id,
      date: day,
      unadjustedDate: day,
      wasAdjusted: false,
      amount: t.amount,
      isEstimate: false,
      kind: 'manual',
      label: t.note || (t.amount < 0 ? 'Money Out' : 'Money In'),
      isPaidOrReceived: day <= today,
    });
  }
  return events;
}

/**
 * The whole dashboard projection: today's balance, the day-by-day forecast, the chronological
 * event list, and summary figures. Same rules as the iOS DashboardViewModel.refresh.
 */
export function buildDashboard(data, today) {
  const settings = data.settings;
  const business = new BusinessDays(settings.treatFederalHolidaysAsNonBusinessDays);
  const window = ESTIMATION_WINDOWS[settings.estimationMethod] ?? 12;
  const horizonEnd = D.addDays(today, settings.forecastHorizonDays);

  const latest = [...data.balances].sort((a, b) => (a.asOfDate < b.asOfDate ? -1 : 1)).at(-1) || null;
  const startingBalance = latest ? latest.amount : 0;
  const asOfDate = latest ? latest.asOfDate : today;
  // An entered balance is end-of-day for its date, so events run from the day after it.
  const eventsStart = latest ? D.addDays(asOfDate, 1) : today;

  const all = [];

  for (const card of data.cards) {
    if (!card.isActive) continue;
    const occurrences = monthlyOccurrences(
      { daysOfMonth: [card.paymentDueDay], startDate: null, endDate: null, adjustment: card.dueDateAdjustment, horizonStart: eventsStart, horizonEnd },
      business,
    );
    const estimate = estimateCardAmount(card.statements, card.expectedMonthlyAmount, window);
    const actualsByPeriod = new Map();
    for (const s of card.statements) {
      const key = D.monthOf(s.statementDate);
      if (!actualsByPeriod.has(key)) actualsByPeriod.set(key, s.amount);
    }
    for (const occ of occurrences) {
      const period = statementPeriodForDueDate(occ.scheduledUnadjustedDate, card);
      const actual = actualsByPeriod.get(period);
      const resolved = actual !== undefined ? { amount: actual, isEstimate: false } : estimate;
      all.push({
        id: `card:${card.id}:${occ.scheduledUnadjustedDate}`,
        sourceId: card.id,
        date: occ.adjustedDate,
        unadjustedDate: occ.scheduledUnadjustedDate,
        wasAdjusted: occ.wasAdjusted,
        amount: -resolved.amount,
        isEstimate: resolved.isEstimate,
        kind: 'cardPayment',
        label: displayName(card),
        isPaidOrReceived: false,
      });
    }
  }

  for (const payment of data.payments) {
    if (!payment.isActive) continue;
    const overrides = new Map(payment.overrides.map((o) => [o.scheduledUnadjustedDate, o]));
    for (const occ of paymentOccurrences(payment, eventsStart, horizonEnd, business)) {
      const override = overrides.get(occ.scheduledUnadjustedDate);
      all.push({
        id: `payment:${payment.id}:${occ.scheduledUnadjustedDate}`,
        sourceId: payment.id,
        date: occ.adjustedDate,
        unadjustedDate: occ.scheduledUnadjustedDate,
        wasAdjusted: occ.wasAdjusted,
        amount: -(override?.amountOverride ?? payment.amount),
        isEstimate: false,
        kind: 'recurringPayment',
        label: payment.name,
        isPaidOrReceived: override?.isPaid ?? false,
      });
    }
  }

  for (const income of data.incomes) {
    if (!income.isActive) continue;
    const overrides = new Map(income.overrides.map((o) => [o.scheduledUnadjustedDate, o]));
    for (const occ of incomeOccurrences(income, eventsStart, horizonEnd, business)) {
      const override = overrides.get(occ.scheduledUnadjustedDate);
      all.push({
        id: `income:${income.id}:${occ.scheduledUnadjustedDate}`,
        sourceId: income.id,
        date: occ.adjustedDate,
        unadjustedDate: occ.scheduledUnadjustedDate,
        wasAdjusted: occ.wasAdjusted,
        amount: override?.amountOverride ?? income.amount,
        isEstimate: false,
        kind: 'income',
        label: income.name,
        isPaidOrReceived: override?.isReceived ?? false,
      });
    }
  }

  const manual = manualEvents(data.manual, latest, asOfDate, today, horizonEnd);
  all.push(...manual);

  const daysSinceEntered = Math.max(D.diffDays(asOfDate, today), 0);
  const allDays = projectDays({ startingBalance, asOfDate, horizonDays: daysSinceEntered + settings.forecastHorizonDays, events: all });
  const days = allDays.filter((d) => d.date >= today);
  const todaysBalance = days.length ? days[0].endingBalance : latest ? latest.amount : null;

  let lowest = null;
  for (const day of days) if (!lowest || day.endingBalance < lowest.endingBalance) lowest = day;

  const future = all.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pendingStatements = [];
  for (const card of data.cards) {
    if (!card.isActive) continue;
    const statementDate = pendingStatementDate(card, today);
    if (statementDate) pendingStatements.push({ card, statementDate });
  }

  return {
    days,
    // Manual transactions dated before today have already moved the balance but stay listed so
    // they can still be found and removed.
    events: [...manual.filter((e) => e.date < today), ...days.flatMap((d) => d.events)],
    summary: {
      currentBalance: latest ? todaysBalance : null,
      enteredBalance: latest ? latest.amount : null,
      enteredBalanceDate: latest ? latest.asOfDate : null,
      lowestBalance: lowest ? lowest.endingBalance : null,
      lowestBalanceDate: lowest ? lowest.date : null,
      nextIncome: future.find((e) => e.kind === 'income') || null,
      nextPayments: future.filter((e) => e.kind === 'cardPayment' || e.kind === 'recurringPayment').slice(0, 3),
      pendingStatements,
    },
  };
}

/** Upcoming occurrences of one payment/income with its overrides applied (detail screens). */
export function occurrenceRows(item, kind, settings, today) {
  const business = new BusinessDays(settings.treatFederalHolidaysAsNonBusinessDays);
  const horizonEnd = D.addDays(today, settings.forecastHorizonDays);
  const occurrences = kind === 'income' ? incomeOccurrences(item, today, horizonEnd, business) : paymentOccurrences(item, today, horizonEnd, business);
  const overrides = new Map(item.overrides.map((o) => [o.scheduledUnadjustedDate, o]));
  return occurrences.map((occ) => {
    const override = overrides.get(occ.scheduledUnadjustedDate) || null;
    return {
      ...occ,
      amount: override?.amountOverride ?? item.amount,
      isOverridden: override?.amountOverride != null,
      isMarked: kind === 'income' ? (override?.isReceived ?? false) : (override?.isPaid ?? false),
      override,
    };
  });
}

// ---------------------------------------------------------------- card payment report

/** Total paid across all cards per payment month, with trailing and rolling averages. */
export function buildPaymentReport(cards) {
  const amounts = new Map(); // month -> Map(cardName -> amount)
  for (const card of cards) {
    const name = displayName(card);
    for (const s of card.statements) {
      const paidIn = paymentMonth(D.monthOf(s.statementDate), card.statementDay, card.paymentDueDay);
      if (!amounts.has(paidIn)) amounts.set(paidIn, new Map());
      const perCard = amounts.get(paidIn);
      perCard.set(name, (perCard.get(name) || 0) + s.amount);
    }
  }

  const months = [...amounts.keys()].sort().map((month) => {
    const byCard = [...amounts.get(month)]
      .map(([cardName, amount]) => ({ cardName, amount }))
      .sort((a, b) => (a.amount !== b.amount ? b.amount - a.amount : a.cardName < b.cardName ? -1 : 1));
    return { month, total: byCard.reduce((sum, c) => sum + c.amount, 0), byCard };
  });

  const windowOf = (count, current) => new Set(Array.from({ length: Math.max(count, 1) }, (_, i) => Month.add(current, -(i + 1))));

  return {
    months,
    /** Average monthly total over the `count` completed months before `current`. */
    average(count, current) {
      const window = windowOf(count, current);
      const inWindow = months.filter((m) => window.has(m.month));
      if (inWindow.length === 0) return null;
      return { average: inWindow.reduce((s, m) => s + m.total, 0) / inWindow.length, monthCount: inWindow.length };
    },
    /** Per-card version: each card averaged over its own months with data. */
    averageByCard(count, current) {
      const window = windowOf(count, current);
      const sums = new Map();
      for (const month of months) {
        if (!window.has(month.month)) continue;
        for (const item of month.byCard) {
          const entry = sums.get(item.cardName) || { total: 0, count: 0 };
          entry.total += item.amount;
          entry.count += 1;
          sums.set(item.cardName, entry);
        }
      }
      return new Map([...sums].map(([name, e]) => [name, { average: e.total / e.count, monthCount: e.count }]));
    },
    /** For every month with data: the average over that month and the `window - 1` before it. */
    rolling(count) {
      const size = Math.max(count, 1);
      const result = new Map();
      for (const month of months) {
        const first = Month.index(month.month) - (size - 1);
        const inWindow = months.filter((m) => Month.index(m.month) >= first && Month.index(m.month) <= Month.index(month.month));
        result.set(month.month, inWindow.reduce((s, m) => s + m.total, 0) / inWindow.length);
      }
      return result;
    },
  };
}

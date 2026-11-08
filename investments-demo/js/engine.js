// Finans engine — a faithful port of the iOS app's FinansCore (Calculator, Importer/Exporter,
// banks, gamification, plan generator). Pure functions, no DOM. Loaded as a classic script so the
// same file runs in the browser and in JavaScriptCore tests: everything hangs off globalThis.FE.
(function (root) {
  "use strict";

  // ───────────────────────── Dates (calendar days as "YYYY-MM-DD") ─────────────────────────
  const DAY = 86400000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  function parseDay(s) {
    if (typeof s !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const num = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const fromNum = (n) => { const t = new Date(n * DAY); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const make = (y, m, d) => fromNum(Date.UTC(y, m - 1, d) / DAY);
  const ymd = (s) => s.split("-").map(Number);
  const year = (s) => ymd(s)[0];
  const daysBetween = (a, b) => num(b) - num(a);
  const addDays = (s, n) => fromNum(num(s) + n);
  function endOfMonth(y, m) { return fromNum(Date.UTC(y, m, 0) / DAY); }
  function addMonths(s, n) {
    const [y, m, d] = ymd(s);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const eom = +endOfMonth(t.getUTCFullYear(), t.getUTCMonth() + 1).slice(8);
    return make(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, eom));
  }
  const addYears = (s, n) => addMonths(s, 12 * n);
  /** Next record day (15th or month end) strictly after `s`. */
  function nextRecordDay(s) {
    const [y, m, d] = ymd(s);
    const eom = endOfMonth(y, m), eomDay = +eom.slice(8);
    if (d < 15) return make(y, m, 15);
    if (d < eomDay) return eom;
    const n = addMonths(make(y, m, 1), 1);
    return make(year(n), ymd(n)[1], 15);
  }
  /** Latest record day on or before `s`. */
  function recordDayOnOrBefore(s) {
    const [y, m, d] = ymd(s);
    const eom = endOfMonth(y, m);
    if (d === +eom.slice(8)) return eom;
    if (d >= 15) return make(y, m, 15);
    const p = addMonths(make(y, m, 1), -1);
    return endOfMonth(year(p), ymd(p)[1]);
  }
  function today(now = new Date()) { return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }

  // ───────────────────────── Fields & banks ─────────────────────────
  const LEADING = ["date", "status", "fidelity", "saving", "checking", "borc", "cash"];
  const TRAILING = ["fidelity_transfer_in", "legacy_1yil", "legacy_oran", "legacy_30day", "note"];
  const RESERVED = new Set([...LEADING, ...TRAILING]);
  const LABELS = {
    date: "Date", status: "Status", fidelity: "Brokerage", saving: "Savings", checking: "Checking",
    borc: "Receivables", cash: "Cash", fidelity_transfer_in: "Transfer to brokerage", legacy_1yil: "1 Year",
    legacy_oran: "Ratio", legacy_30day: "30 Days (sheet)", note: "Note",
  };
  const DEFAULT_BANKS = [
    { key: "everyday", name: "Everyday Checking", kind: "checking", hidden: false },
    { key: "hysa", name: "High-Yield Savings", kind: "saving", hidden: false },
    { key: "other", name: "Other", kind: "checking", hidden: false },
  ];
  const defaultKind = (k) => (DEFAULT_BANKS.find((b) => b.key === k) || { kind: "checking" }).kind;
  function defaultName(k) {
    const d = DEFAULT_BANKS.find((b) => b.key === k);
    if (d) return d.name;
    return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const isValidKey = (k) => /^[a-z][a-z0-9_]{0,31}$/.test(k) && !RESERVED.has(k);
  function makeKey(name, existing) {
    const fold = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
    let s = name.toLocaleLowerCase("tr-TR").replace(/[çğıöşüâîû]|i̇/g, (c) => fold[c] || c)
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    let out = "";
    for (const ch of s) {
      if (/[a-z0-9]/.test(ch)) out += ch;
      else if (!out.endsWith("_")) out += "_";
    }
    out = out.replace(/^_+|_+$/g, "");
    if (!out || !/^[a-z]/.test(out)) out = "bank_" + out;
    out = out.slice(0, 28).replace(/_+$/g, "");
    const taken = new Set(existing);
    let c = out, n = 2;
    while (!isValidKey(c) || taken.has(c)) c = `${out}_${n++}`;
    return c;
  }
  function sortKeys(keys) {
    const order = new Map(DEFAULT_BANKS.map((b, i) => [b.key, i]));
    return [...keys].sort((a, b) => {
      const x = order.get(a), y = order.get(b);
      if (x != null && y != null) return x - y;
      if (x != null) return -1;
      if (y != null) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  function orderedKeys(preferred, records) {
    const seen = new Set(), out = [];
    for (const k of preferred) if (!seen.has(k)) { seen.add(k); out.push(k); }
    const extra = new Set();
    for (const r of records) for (const k of Object.keys(r.banks)) if (!seen.has(k)) extra.add(k);
    return out.concat(sortKeys(extra));
  }
  const kindsOf = (banks) => Object.fromEntries(banks.map((b) => [b.key, b.kind]));

  // ───────────────────────── Records ─────────────────────────
  function emptyRecord(date) {
    return { date, status: "actual", fidelity: 0, saving: 0, checking: 0, borc: null, cash: null, banks: {},
      fidelity_transfer_in: null, legacy_1yil: null, legacy_oran: null, legacy_30day: null, note: "" };
  }
  const clone = (r) => ({ ...r, banks: { ...r.banks } });
  const z = (v) => (v == null ? 0 : v);
  const hasBreakdown = (r) => Object.values(r.banks).some((v) => v != null && v !== 0);
  const kindOf = (k, kinds) => (kinds && kinds[k]) || defaultKind(k);
  function derived(r, kinds, kind) {
    let s = 0;
    for (const [k, v] of Object.entries(r.banks)) if (kindOf(k, kinds) === kind) s += z(v);
    return s;
  }
  /** saving = Σ Birikim banks, checking = Σ Vadesiz banks, when any bank value is non-zero. */
  function applyBreakdownRule(r, kinds) {
    if (!hasBreakdown(r)) return r;
    r.saving = derived(r, kinds, "saving");
    r.checking = derived(r, kinds, "checking");
    return r;
  }

  /** Canonical text: the exact string written to CSV/JSON and used for diffing. */
  function numText(v) { return v == null ? "" : String(v); }
  function text(r, col) {
    switch (col) {
      case "date": return r.date;
      case "status": return r.status;
      case "note": return r.note || "";
      default:
        if (RESERVED.has(col)) return numText(r[col]);
        return numText(r.banks[col]);
    }
  }
  const columns = (bankKeys) => LEADING.concat(bankKeys, TRAILING);

  // ───────────────────────── Calculations ─────────────────────────
  const digital = (r) => r.fidelity + r.saving + r.checking;
  const total = (r) => digital(r) + z(r.borc) + z(r.cash);

  function row(r, p) {
    const d = digital(r), t = total(r);
    if (!p) return { record: r, date: r.date, isPlan: r.status === "plan", days: null, digital: d, total: t,
      fark: null, digitalChange: null, net: null, average30: null };
    const fark = r.fidelity - p.fidelity - z(r.fidelity_transfer_in);
    return { record: r, date: r.date, isPlan: r.status === "plan", days: daysBetween(p.date, r.date),
      digital: d, total: t, fark, digitalChange: d - digital(p), net: t - total(p) - Math.max(fark, 0), average30: null };
  }

  /** Rows ascending. Plan rows dated before the latest actual are ignored (stale projections). */
  function compute(records) {
    let latest = null;
    for (const r of records) if (r.status === "actual" && (!latest || r.date > latest)) latest = r.date;
    const sorted = records.filter((r) => !(r.status === "plan" && latest && r.date < latest))
      .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const out = [];
    let netSum = 0;
    sorted.forEach((r, i) => {
      const x = row(r, i ? sorted[i - 1] : null);
      netSum += z(x.net);
      const days = daysBetween(sorted[0].date, r.date);
      if (days > 0) x.average30 = (netSum / days) * 30;
      out.push(x);
    });
    return out;
  }

  function yearSummaries(rows) {
    const last = new Map();
    for (const r of rows) last.set(year(r.date), r);
    let prev = null;
    return [...last.keys()].sort((a, b) => a - b).map((y) => {
      const r = last.get(y);
      const s = { year: y, fidelityYearEnd: r.record.fidelity, totalYearEnd: r.total,
        annualIncrease: prev == null ? null : r.total - prev, isPlanned: r.isPlan };
      prev = r.total;
      return s;
    });
  }
  const latestActual = (rows) => { for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].isPlan) return rows[i]; return null; };
  function previousOf(rows, r) { const i = rows.indexOf(r); return i > 0 ? rows[i - 1] : null; }
  function yearAgo(rows, r) {
    const target = addYears(r.date, -1);
    let best = null, bestD = 21;
    for (const x of rows) {
      if (x.isPlan) continue;
      const d = Math.abs(daysBetween(target, x.date));
      if (d <= 20 && d < bestD) { best = x; bestD = d; }
    }
    return best;
  }

  /**
   * Splits each period's change into investment gain and savings so the two always add up:
   * gain = Fark (Fidelity change minus transfers in, losses included), saving = change − gain.
   * Unlike the sheet's Net (which keeps Fidelity drops inside Net), this treats drops as
   * investment losses. Used for totals and averages over many periods.
   */
  function flows(rows) {
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.fark == null) continue;
      const change = r.total - rows[i - 1].total;
      out.push({ row: r, date: r.date, change, gain: r.fark, saving: change - r.fark });
    }
    return out;
  }
  function sumFlows(list) {
    return list.reduce((a, f) => ({ change: a.change + f.change, gain: a.gain + f.gain, saving: a.saving + f.saving }), { change: 0, gain: 0, saving: 0 });
  }

  // ───────────────────────── CSV / import / export ─────────────────────────
  function parseCSV(textIn) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < textIn.length; i++) {
      const c = textIn[i];
      if (q) {
        if (c === '"') { if (textIn[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  const csvEscape = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

  class ImportError extends Error {}

  function bankColumns(cols) {
    const banks = cols.filter((c) => !RESERVED.has(c));
    const bad = banks.filter((c) => !isValidKey(c));
    if (bad.length) throw new ImportError(`Unknown column name: ${bad.join(", ")}. Bank columns may only use lowercase letters, digits and _ (e.g. savings_2).`);
    return [...new Set(banks)];
  }

  function recordFrom(v, bankKeys) {
    const cell = (k) => (v[k] == null ? "" : String(v[k]).trim());
    const date = parseDay(cell("date"));
    if (!date) return { error: "Invalid date (expected YYYY-MM-DD)" };
    const status = cell("status").toLowerCase();
    if (status !== "actual" && status !== "plan") return { error: "Invalid status (expected actual or plan)" };
    const r = emptyRecord(date);
    r.status = status;
    const numOf = (k) => {
      const s = cell(k);
      if (s === "") return null;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new ImportError(`Not a number (${k}: “${s}”)`);
      return Number(s);
    };
    try {
      r.fidelity = z(numOf("fidelity")); r.saving = z(numOf("saving")); r.checking = z(numOf("checking"));
      r.borc = numOf("borc"); r.cash = numOf("cash");
      for (const k of bankKeys) { const x = numOf(k); if (x != null) r.banks[k] = x; }
      r.fidelity_transfer_in = numOf("fidelity_transfer_in");
      r.legacy_1yil = numOf("legacy_1yil"); r.legacy_oran = numOf("legacy_oran"); r.legacy_30day = numOf("legacy_30day");
    } catch (e) { return { error: e.message }; }
    r.note = v.note == null ? "" : String(v.note);
    return { record: r };
  }

  function build(rows, bankKeys) {
    const records = [], rejected = [], seen = new Set();
    for (const { line, values } of rows) {
      const dateText = (values.date == null ? "" : String(values.date)).trim();
      const res = recordFrom(values, bankKeys);
      if (res.error) rejected.push({ line, dateText, reason: res.error });
      else if (seen.has(res.record.date)) rejected.push({ line, dateText, reason: "Dosyada tekrarlanan tarih" });
      else { seen.add(res.record.date); records.push(res.record); }
    }
    return { records, rejected, bankKeys };
  }

  function importCSV(textIn) {
    const table = parseCSV(textIn);
    if (!table.length) throw new ImportError("The file is empty.");
    const header = table[0].map((h) => h.trim().toLowerCase());
    const missing = ["date", "status"].filter((c) => !header.includes(c));
    if (missing.length) throw new ImportError(`Missing column: ${missing.join(", ")}.`);
    const bankKeys = bankColumns(header.filter(Boolean));
    const rows = [];
    table.slice(1).forEach((cells, i) => {
      if (cells.every((c) => !c.trim())) return;
      const values = {};
      header.forEach((h, c) => { if (c < cells.length) values[h] = cells[c]; });
      rows.push({ line: i + 2, values });
    });
    return build(rows, bankKeys);
  }

  function importJSON(textIn) {
    let root;
    try { root = JSON.parse(textIn); } catch { throw new ImportError('Invalid JSON. Expected: { "schema_version": 1, "snapshots": [ … ] }'); }
    let items;
    if (Array.isArray(root)) items = root;
    else if (root && typeof root === "object") {
      if (Number.isInteger(root.schema_version) && root.schema_version !== 1) throw new ImportError(`Desteklenmeyen schema_version: ${root.schema_version}.`);
      if (!Array.isArray(root.snapshots)) throw new ImportError('Invalid JSON. Expected: { "schema_version": 1, "snapshots": [ … ] }');
      items = root.snapshots;
    } else throw new ImportError("Invalid JSON.");
    const rows = [], rejected = [], keys = new Set();
    items.forEach((it, i) => {
      if (!it || typeof it !== "object" || Array.isArray(it)) { rejected.push({ line: i + 1, dateText: "", reason: "Row is not an object" }); return; }
      const values = {};
      for (const [k, v] of Object.entries(it)) { values[k.toLowerCase()] = v == null ? "" : typeof v === "object" ? "\u0000invalid" : String(v); keys.add(k.toLowerCase()); }
      rows.push({ line: i + 1, values });
    });
    const parsed = build(rows, sortKeys(bankColumns([...keys])));
    parsed.rejected = rejected.concat(parsed.rejected).sort((a, b) => a.line - b.line);
    return parsed;
  }

  function importAny(textIn) {
    const t = textIn.replace(/^﻿/, "");
    if (!t.trim()) throw new ImportError("The file is empty.");
    return /^\s*[\[{]/.test(t) ? importJSON(t) : importCSV(t);
  }

  function exportCSV(records, bankKeys) {
    const cols = columns(orderedKeys(bankKeys, records));
    const sorted = records.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    return [cols.join(",")].concat(sorted.map((r) => cols.map((c) => csvEscape(text(r, c))).join(","))).join("\n") + "\n";
  }
  function exportJSON(records, bankKeys) {
    const cols = columns(orderedKeys(bankKeys, records));
    const sorted = records.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const items = sorted.map((r) => "    {\n" + cols.map((c) => {
      const t = text(r, c);
      const v = c === "date" || c === "status" || c === "note" ? JSON.stringify(t) : t === "" ? "null" : t;
      return `      ${JSON.stringify(c)}: ${v}`;
    }).join(",\n") + "\n    }");
    return '{\n  "schema_version": 1,\n  "currency": "USD",\n  "snapshots": [' + (items.length ? "\n" + items.join(",\n") + "\n  ]\n}\n" : "]\n}\n");
  }

  function changes(a, b) {
    const keys = sortKeys(new Set([...Object.keys(a.banks), ...Object.keys(b.banks)]));
    return LEADING.slice(1).concat(keys, TRAILING).flatMap((c) => {
      const before = text(b, c), after = text(a, c);
      return before === after ? [] : [{ key: c, before, after }];
    });
  }
  function importPlan(parsed, existing) {
    const by = new Map(existing.map((r) => [r.date, r]));
    const plan = { newRecords: [], changed: [], unchanged: [], rejected: parsed.rejected };
    for (const r of parsed.records.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const old = by.get(r.date);
      if (!old) plan.newRecords.push(r);
      else { const ch = changes(r, old); if (ch.length) plan.changed.push({ record: r, existing: old, changes: ch }); else plan.unchanged.push(r); }
    }
    return plan;
  }

  // ───────────────────────── Gamification ─────────────────────────
  const STREAK_GAP = 35;
  const MILESTONES = [10e3, 25e3, 50e3, 75e3, 100e3, 125e3, 150e3, 200e3, 250e3, 300e3, 400e3, 500e3, 750e3, 1e6, 1.5e6, 2e6, 3e6, 5e6];

  function checkIn(latest, todayS) {
    if (!latest) return { state: "dueToday", due: todayS, days: 0 };
    const due = nextRecordDay(latest), d = daysBetween(todayS, due);
    if (d > 0) return { state: "upcoming", due, days: d };
    if (d === 0) return { state: "dueToday", due, days: 0 };
    return { state: "overdue", due, days: -d };
  }
  function suggestedDate(latest, todayS) {
    const c = checkIn(latest, todayS);
    if (c.state === "upcoming") { if (c.days <= 3) return c.due; if (latest && todayS <= latest) return c.due; return todayS; }
    if (c.state === "dueToday") return c.due;
    const last = recordDayOnOrBefore(todayS);
    return latest && last <= latest ? nextRecordDay(latest) : last;
  }
  function streak(records, todayS) {
    const dates = records.filter((r) => r.status === "actual").map((r) => r.date).sort();
    if (!dates.length) return { current: 0, best: 0, atRisk: false };
    let run = 1, best = 1;
    for (let i = 1; i < dates.length; i++) { run = daysBetween(dates[i - 1], dates[i]) <= STREAK_GAP ? run + 1 : 1; best = Math.max(best, run); }
    const last = dates[dates.length - 1];
    const alive = daysBetween(last, todayS) <= STREAK_GAP;
    return { current: alive ? run : 0, best, atRisk: alive && todayS > nextRecordDay(last) };
  }
  function level(rows) {
    const l = latestActual(rows);
    if (!l) return null;
    const t = l.total, passed = MILESTONES.filter((m) => m <= t);
    const floor = passed.length ? passed[passed.length - 1] : 0, next = MILESTONES.find((m) => m > t) ?? null;
    let fraction = 1, remaining = null, eta = null;
    if (next != null) {
      fraction = (t - floor) / (next - floor); remaining = next - t;
      const ago = yearAgo(rows, l);
      if (ago) {
        const perDay = (l.total - ago.total) / Math.max(daysBetween(ago.date, l.date), 1);
        if (perDay > 0) eta = addDays(l.date, Math.ceil(remaining / perDay));
      }
    }
    return { level: passed.length, floor, next, fraction: Math.min(Math.max(fraction, 0), 1), remaining, eta };
  }
  const GRADE_MSG = {
    "A+": "Outstanding period, well above your average.", A: "Great, above your average.",
    B: "Going well, close to your average.", C: "Below average, but still positive.",
    D: "Negative this period. The next one can make up for it.",
  };
  function grade(net, days, baseline30) {
    const expected = (z(baseline30) / 30) * Math.max(days, 1);
    if (!(expected > 0)) return net > 0 ? "A" : net === 0 ? "C" : "D";
    const r = net / expected;
    return r >= 1.5 ? "A+" : r >= 1 ? "A" : r >= 0.5 ? "B" : r >= 0 ? "C" : "D";
  }
  function gradeOf(r, rows) {
    const i = rows.indexOf(r);
    if (r.net == null || r.days == null || i <= 0) return null;
    return grade(r.net, r.days, rows[i - 1].average30);
  }
  function planTarget(rows, date) {
    const plans = rows.filter((r) => r.isPlan);
    const hit = plans.find((r) => r.date === date);
    if (hit) return { total: hit.total, exact: true };
    const actualsBefore = rows.filter((r) => !r.isPlan && r.date < date);
    const lastActual = actualsBefore.length ? actualsBefore[actualsBefore.length - 1] : null;
    const anchors = (lastActual ? [lastActual] : []).concat(plans.filter((p) => !lastActual || p.date > lastActual.date));
    const after = anchors.find((a) => a.date > date);
    const before = anchors.filter((a) => a.date < date).pop();
    if (!after || !before) return null;
    const span = daysBetween(before.date, after.date);
    if (span <= 0) return null;
    return { total: before.total + ((after.total - before.total) * daysBetween(before.date, date)) / span, exact: false };
  }
  function short(v) {
    const t = (x) => (x === Math.round(x) ? String(Math.round(x)) : x.toFixed(1));
    if (v >= 1e6) return "$" + t(v / 1e6) + "M";
    if (v >= 1e3) return "$" + t(v / 1e3) + "K";
    return "$" + Math.trunc(v);
  }
  function achievements(allRows) {
    const rows = allRows.filter((r) => !r.isPlan);
    const out = [];
    const add = (id, title, detail, icon, unlockedAt, progress, textP) =>
      out.push({ id, title, detail, icon, unlockedAt: unlockedAt || null,
        progress: unlockedAt ? 1 : Math.min(Math.max(progress, 0), 1), progressText: unlockedAt ? "Earned" : textP });
    for (const n of [1, 10, 25, 50, 100])
      add(`checkins_${n}`, n === 1 ? "First step" : `${n} entries`, n === 1 ? "You made your first entry." : `${n} actual entries in total.`,
        n === 1 ? "🚩" : "✅", rows.length >= n ? rows[n - 1].date : null, rows.length / n, `${rows.length}/${n}`);
    const runs = []; let run = 0;
    rows.forEach((r, i) => { run = i > 0 && daysBetween(rows[i - 1].date, r.date) <= STREAK_GAP ? run + 1 : 1; runs.push([r.date, run]); });
    const bestRun = runs.reduce((m, x) => Math.max(m, x[1]), 0);
    for (const n of [5, 10, 25, 50])
      add(`streak_${n}`, `${n}-entry streak`, `Make ${n} entries in a row without missing one.`, "🔥",
        (runs.find((x) => x[1] >= n) || [])[0], bestRun / n, `Best ${bestRun}/${n}`);
    const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0);
    for (const m of [25e3, 50e3, 100e3, 150e3, 250e3, 500e3, 1e6])
      add(`nw_${m}`, `${short(m)} club`, `Total net worth passed ${short(m)}.`, "🏆",
        (rows.find((r) => r.total >= m) || {}).date, maxTotal / m, `${Math.trunc((maxTotal / m) * 100)}%`);
    const maxFid = rows.reduce((m, r) => Math.max(m, r.record.fidelity), 0);
    for (const m of [50e3, 100e3, 250e3])
      add(`fid_${m}`, `Brokerage ${short(m)}`, `Your brokerage account reached ${short(m)}.`, "📈",
        (rows.find((r) => r.record.fidelity >= m) || {}).date, maxFid / m, `${Math.trunc((maxFid / m) * 100)}%`);
    let plus = 0, plusBest = 0, plusAt = null;
    for (const r of rows) { plus = z(r.net) > 0 ? plus + 1 : 0; plusBest = Math.max(plusBest, plus); if (plus >= 3 && !plusAt) plusAt = r.date; }
    add("positive_3", "Three for three", "Three positive periods in a row.", "↗️", plusAt, plusBest / 3, `Best ${plusBest}/3`);
    const bestNet = rows.reduce((m, r) => (r.net != null && r.net > m ? r.net : m), 0);
    add("saver_5k", "Big saver", "$5,000+ net in a single period.", "💵", (rows.find((r) => z(r.net) >= 5000) || {}).date, bestNet / 5000, `Record ${short(Math.max(bestNet, 0))}`);
    add("investor", "Investor", "You logged your first transfer to the brokerage account.", "➡️", (rows.find((r) => z(r.record.fidelity_transfer_in) > 0) || {}).date, 0, "Not yet");
    const last = new Map(); for (const r of rows) last.set(year(r.date), r);
    let prev = null, yearAt = null, bestYear = 0;
    for (const y of [...last.keys()].sort((a, b) => a - b)) {
      const r = last.get(y);
      if (prev != null) { bestYear = Math.max(bestYear, r.total - prev); if (r.total - prev >= 25e3 && !yearAt) yearAt = r.date; }
      prev = r.total;
    }
    add("year_25k", "Record year", "+$25K growth in one year.", "📅", yearAt, bestYear / 25e3, `Best ${short(bestYear)}`);
    return out;
  }

  // ───────────────────────── Plan generator ─────────────────────────
  const FREQUENCIES = [
    { id: "weekly", label: "Weekly" }, { id: "biweekly", label: "Every 2 weeks" },
    { id: "semimonthly", label: "Twice a month (15th and month end)" }, { id: "monthly", label: "Monthly (month end)" },
  ];
  function nextPlanDate(s, f) {
    if (f === "weekly") return addDays(s, 7);
    if (f === "biweekly") return addDays(s, 14);
    if (f === "semimonthly") return nextRecordDay(s);
    const [y, m] = ymd(s), eom = endOfMonth(y, m);
    if (s < eom) return eom;
    const n = addDays(s, 1);
    return endOfMonth(year(n), ymd(n)[1]);
  }
  function planDates(after, end, f) {
    const out = []; let d = nextPlanDate(after, f);
    while (d <= end && out.length < 2000) { out.push(d); d = nextPlanDate(d, f); }
    return out;
  }
  const DPM = 30.4375;
  function generatePlan(base, end, f, a) {
    let fid = base.fidelity, chk = base.checking, prev = base.date;
    return planDates(base.date, end, f).map((d) => {
      const days = daysBetween(prev, d), months = days / DPM;
      const tin = a.monthlyTransfer * months;
      fid = fid * Math.pow(1 + a.annualReturn, days / 365) + tin;
      chk += a.monthlySavings * months;
      const r = emptyRecord(d);
      Object.assign(r, { status: "plan", fidelity: Math.round(fid), saving: base.saving, checking: Math.round(chk),
        borc: base.borc, cash: base.cash, note: "Auto plan" });
      if (a.monthlyTransfer) r.fidelity_transfer_in = Math.round(tin);
      prev = d;
      return r;
    });
  }
  /** Least-squares line y = a + b·x with R². */
  function linearFit(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (!sxx) return null;
    const b = sxy / sxx;
    return { a: my - b * mx, b, r2: syy ? (sxy * sxy) / (sxx * syy) : 1, mean: my };
  }
  /**
   * Plan model fitted to the last `months` of actual records.
   * Fidelity and "the rest" (banks + receivables + cash) each get a straight-line trend (per month).
   * Fidelity is then split into a monthly contribution plus compounding at `annualReturn`, calibrated
   * so the model reproduces the past trend: contribution = trend − monthly return × average balance.
   * The rest goes into the banks; receivables and cash stay flat in the plan.
   */
  function trendModel(records, months = 24, annualReturn = 0.07) {
    const rows = compute(records).filter((r) => !r.isPlan);
    const last = rows[rows.length - 1];
    if (!last) return null;
    const win = rows.filter((r) => daysBetween(r.date, last.date) <= months * DPM && r.total > 0);
    const xs = win.map((r) => daysBetween(last.date, r.date) / DPM);
    const fid = linearFit(xs, win.map((r) => r.record.fidelity));
    const rest = linearFit(xs, win.map((r) => r.total - r.record.fidelity));
    const tot = linearFit(xs, win.map((r) => r.total));
    if (!fid || !rest || !tot) return null;
    const rm = Math.pow(1 + annualReturn, 1 / 12) - 1;
    return {
      months, count: win.length, from: win[0].date, to: last.date, annualReturn,
      total: { monthly: tot.b, r2: tot.r2 }, fidelity: { monthly: fid.b, r2: fid.r2 }, rest: { monthly: rest.b, r2: rest.r2 },
      contribution: Math.max(Math.round(fid.b - rm * fid.mean), 0), bankMonthly: Math.round(rest.b),
    };
  }
  function impliedAssumptions(records) {
    const rows = compute(records), act = latestActual(rows);
    if (!act) return { annualReturn: 0.1, monthlyTransfer: 0, monthlySavings: 0 };
    const plan = rows.filter((r) => r.isPlan && r.date > act.date).pop();
    if (!plan) return { annualReturn: 0.1, monthlyTransfer: 0, monthlySavings: Math.max(Math.round((z(act.average30) / 30) * DPM), 0) };
    const days = daysBetween(act.date, plan.date);
    const transfers = rows.filter((r) => r.date > act.date && r.date <= plan.date).reduce((s, r) => s + z(r.record.fidelity_transfer_in), 0);
    const start = act.record.fidelity, endG = plan.record.fidelity - transfers;
    const rate = start > 0 && days > 0 ? Math.pow(endG / start, 365 / days) - 1 : 0.1;
    const months = days / DPM;
    return { annualReturn: Math.round(rate * 1000) / 1000, monthlyTransfer: months > 0 ? Math.round(transfers / months) : 0,
      monthlySavings: months > 0 ? Math.round((plan.record.checking + plan.record.saving - act.record.checking - act.record.saving) / months) : 0 };
  }

  // ───────────────────────── Market ─────────────────────────
  const MARKETS = [
    { id: "sp500", name: "S&P 500", detail: "Index (^GSPC)", symbol: "^GSPC", style: "points" },
    { id: "btc", name: "Bitcoin", detail: "BTC / USD", symbol: "BTC-USD", style: "usd" },
    { id: "eurusd", name: "EUR / USD", detail: "Euro to US dollar", symbol: "EURUSD=X", style: "rate" },
    { id: "iau", name: "IAU", detail: "iShares Gold Trust", symbol: "IAU", style: "usd" },
  ];
  function parseYahoo(json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r) throw new Error("No price data found.");
    const ts = r.timestamp || [], closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
    const points = ts.map((t, i) => (closes[i] == null ? null : { t: t * 1000, close: closes[i] })).filter(Boolean);
    const price = r.meta.regularMarketPrice ?? (points.length ? points[points.length - 1].close : null);
    if (price == null) throw new Error("No price data found.");
    return { price, changePercent: r.meta.regularMarketChangePercent ?? null, time: (r.meta.regularMarketTime || 0) * 1000, points };
  }

  // ───────────────────────── Formatting ─────────────────────────
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  function money(v, signed = false) {
    if (v == null) return "—";
    const r = Math.round(Math.abs(v)), s = nf0.format(r);
    if (r === 0) return "$0";
    if (v < 0) return "−$" + s;
    return (signed ? "+$" : "$") + s;
  }
  function pct(v, signed = false) {
    if (v == null || !isFinite(v)) return "—";
    const s = Math.abs(v * 100).toFixed(1);
    if (s === "0.0") return "0%";
    return (v < 0 ? "−" : signed ? "+" : "") + s + "%";
  }
  function dateTR(s) { const [y, m, d] = ymd(s); return `${d} ${MONTHS[m - 1]} ${y}`; }
  function monthYearTR(s) { const [y, m] = ymd(s); return `${MONTHS_LONG[m - 1]} ${y}`; }
  function searchKey(s) { const [y, m] = ymd(s); return `${s} ${MONTHS_LONG[m - 1]} ${MONTHS[m - 1]} ${y}`.toLowerCase(); }

  root.FE = {
    parseDay, daysBetween, addDays, addMonths, addYears, nextRecordDay, recordDayOnOrBefore, endOfMonth, today, year,
    LEADING, TRAILING, LABELS, DEFAULT_BANKS, defaultKind, defaultName, isValidKey, makeKey, sortKeys, orderedKeys, kindsOf,
    emptyRecord, clone, hasBreakdown, applyBreakdownRule, derived, text, columns,
    linearFit, trendModel,
    digital, total, row, compute, yearSummaries, latestActual, previousOf, yearAgo, flows, sumFlows,
    parseCSV, ImportError, importCSV, importJSON, importAny, exportCSV, exportJSON, changes, importPlan,
    STREAK_GAP, MILESTONES, checkIn, suggestedDate, streak, level, grade, gradeOf, GRADE_MSG, planTarget, achievements, short,
    FREQUENCIES, planDates, generatePlan, impliedAssumptions,
    MARKETS, parseYahoo, money, pct, dateTR, monthYearTR, searchKey, MONTHS_LONG,
  };
})(globalThis);

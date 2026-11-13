// Portfolio look-through and simple risk maths for the Fidelity page. Pure functions (no DOM, no
// network) so they can be tested from the command line: see tests/risk.test.js.
(function (root) {
  "use strict";
  const FD = root.FD;
  const WEEKS = 52;
  const Z95 = 1.645;

  // ───────── holdings ─────────
  /** Cleans a holdings object: known shape, numeric values, upper-case symbols. */
  function normalizeHoldings(h) {
    const out = { asof: null, source: "", note: "", accounts: [] };
    if (!h || typeof h !== "object") return out;
    out.asof = typeof h.asof === "string" ? h.asof.slice(0, 10) : null;
    out.source = String(h.source || "").slice(0, 200);
    out.note = String(h.note || "").slice(0, 500);
    for (const a of Array.isArray(h.accounts) ? h.accounts : []) {
      const positions = [];
      for (const p of Array.isArray(a.positions) ? a.positions : []) {
        const symbol = String(p.symbol || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
        const value = Number(p.value), shares = Number(p.shares);
        if (!symbol || !Number.isFinite(value) || value === 0) continue;
        const pos = { symbol, value };
        if (p.shares != null && Number.isFinite(shares) && shares > 0) pos.shares = shares;
        positions.push(pos);
      }
      const acc = { id: String(a.id || a.name || "account").slice(0, 40), name: String(a.name || "Account").slice(0, 60), positions };
      if (typeof a.key === "string" && /^[0-9a-f]{8}$/.test(a.key)) acc.key = a.key;
      out.accounts.push(acc);
    }
    out.plan = normalizePlan(h.plan);
    if (Number.isFinite(Number(h.importedMtime))) out.importedMtime = Number(h.importedMtime);
    if (typeof h.importedFile === "string") out.importedFile = h.importedFile.slice(0, 200);
    return out;
  }
  /** Weekly auto-invest plan: which funds get how many dollars on which weekday (3 = Wednesday). */
  function normalizePlan(p) {
    const plan = { weekday: 3, buys: [] };
    if (!p || typeof p !== "object") return plan;
    if (Number.isInteger(p.weekday) && p.weekday >= 1 && p.weekday <= 5) plan.weekday = p.weekday;
    for (const b of Array.isArray(p.buys) ? p.buys : []) {
      const symbol = String(b.symbol || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12), amount = Number(b.amount);
      if (!symbol || !Number.isFinite(amount) || amount <= 0) continue;
      const buy = { symbol, amount };
      if (typeof b.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.from)) buy.from = b.from;
      plan.buys.push(buy);
    }
    return plan;
  }

  /** One row per symbol across all accounts, biggest first. */
  function aggregate(holdings) {
    const by = new Map();
    for (const a of holdings.accounts) for (const p of a.positions) {
      if (!by.has(p.symbol)) by.set(p.symbol, { symbol: p.symbol, value: 0, accounts: [] });
      const row = by.get(p.symbol);
      row.value += p.value; row.accounts.push({ name: a.name, value: p.value, shares: p.shares });
    }
    return [...by.values()].sort((x, y) => y.value - x.value);
  }
  const totalOf = (positions) => positions.reduce((s, p) => s + p.value, 0);

  function normWeights(obj) {
    const sum = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
    const out = {};
    for (const k of Object.keys(obj)) out[k] = obj[k] / sum;
    return out;
  }

  /** Where the money really is: by risk bucket (sector), by asset class, and by company. */
  function lookThrough(positions) {
    const buckets = {}, classes = {}, companies = new Map();
    for (const p of positions) {
      const f = FD.fundOf(p.symbol);
      const w = normWeights(f.sectors);
      for (const b of Object.keys(w)) buckets[b] = (buckets[b] || 0) + p.value * w[b];
      classes[f.cls] = (classes[f.cls] || 0) + p.value;
      for (const [name, pct] of f.top) {
        if (!companies.has(name)) companies.set(name, { name, value: 0, funds: [] });
        const c = companies.get(name);
        c.value += (p.value * pct) / 100; c.funds.push(p.symbol);
      }
    }
    return { buckets, classes, companies: [...companies.values()].sort((a, b) => b.value - a.value) };
  }

  // ───────── price history ─────────
  /** Yahoo chart JSON → [{week, close}] (dividend-adjusted when available), one point per week. */
  function parseHistory(json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r || !r.timestamp) return [];
    const adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
    const raw = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
    const closes = adj && adj.length === r.timestamp.length ? adj : raw || [];
    const byWeek = new Map();
    r.timestamp.forEach((ts, i) => {
      const c = closes[i];
      if (c == null || !(c > 0)) return;
      byWeek.set(Math.floor((ts / 86400 + 3) / 7), c); // Monday-based week number; the last point in a week wins
    });
    return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, close]) => ({ week, close }));
  }
  function weeklyReturns(points) {
    const m = new Map();
    for (let i = 1; i < points.length; i++) {
      if (points[i].week - points[i - 1].week > 3) continue; // gap in the data: skip that jump
      m.set(points[i].week, points[i].close / points[i - 1].close - 1);
    }
    return m;
  }
  /** Returns for `symbols` on the weeks they all share. Symbols with too little history are dropped. */
  function align(histories, symbols, minWeeks = 30) {
    const maps = {}, used = [], missing = [];
    for (const s of symbols) {
      const m = histories[s] ? weeklyReturns(histories[s]) : null;
      if (m && m.size >= minWeeks) { maps[s] = m; used.push(s); } else missing.push(s);
    }
    let weeks = null;
    for (const s of used) {
      const ks = new Set(maps[s].keys());
      weeks = weeks ? weeks.filter((w) => ks.has(w)) : [...ks];
    }
    weeks = (weeks || []).sort((a, b) => a - b);
    const R = {};
    for (const s of used) R[s] = weeks.map((w) => maps[s].get(w));
    return { weeks, R, used, missing };
  }

  // ───────── estimate between two position files ─────────
  /** Yahoo chart JSON (daily) → [{day: "YYYY-MM-DD", close}] in the exchange's own calendar. */
  function parseDaily(json) {
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r || !r.timestamp) return [];
    const close = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
    const off = (r.meta && Number(r.meta.gmtoffset)) || -18000;
    const byDay = new Map();
    r.timestamp.forEach((ts, i) => { if (close[i] > 0) byDay.set(new Date((ts + off) * 1000).toISOString().slice(0, 10), close[i]); });
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, c]) => ({ day, close: c }));
  }
  /** Last close on or before `day`; null when the series doesn't reach back that far. */
  function priceOn(series, day) {
    if (!series || !series.length || series[0].day > day) return null;
    let lo = 0, hi = series.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (series[mid].day <= day) lo = mid; else hi = mid - 1; }
    return series[lo].close;
  }
  const addDay = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const weekdayOf = (day) => new Date(day + "T00:00:00Z").getUTCDay();

  /**
   * Today's estimated holdings: the last position file moved by each fund's price change since then,
   * plus the weekly plan's buys (taken from the cash of the account holding the most cash).
   * `base` is the file itself priced on its own date. Nothing is estimated for funds without prices.
   */
  function estimate(holdings, daily, today) {
    const asof = holdings.asof || today;
    const lastDay = (s) => (daily[s] && daily[s].length ? daily[s][daily[s].length - 1].day : null);
    const missing = new Set();
    const work = holdings.accounts.map((a) => ({ id: a.id, name: a.name, key: a.key, positions: a.positions.map((p) => {
      const cash = FD.fundOf(p.symbol).cash, p0 = cash ? null : priceOn(daily[p.symbol], asof);
      if (!cash && p0 == null) missing.add(p.symbol);
      // shares: as reported, or implied by the file's value and that day's price
      return { symbol: p.symbol, cash, value: p.value, shares: cash || p0 == null ? null : p.shares != null ? p.shares : p.value / p0, base: cash || p0 == null ? p.value : (p.shares != null ? p.shares : p.value / p0) * p0 };
    }) }));
    const baseTotal = work.reduce((s, a) => s + a.positions.reduce((t, p) => t + p.base, 0), 0);

    // weekly plan buys, from the account with the biggest cash position
    const buys = [];
    const plan = holdings.plan || { weekday: 3, buys: [] };
    let cashAcc = null, cashPos = null;
    for (const a of work) for (const p of a.positions) if (p.cash && (!cashPos || p.value > cashPos.value)) { cashAcc = a; cashPos = p; }
    if (cashPos && plan.buys.length) {
      for (let d = addDay(asof, 1); d <= today; d = addDay(d, 1)) {
        if (weekdayOf(d) !== plan.weekday) continue;
        let spent = 0;
        for (const b of plan.buys) {
          if (b.from && d < b.from) continue;
          const px = lastDay(b.symbol) >= d ? priceOn(daily[b.symbol], d) : null; // only once that day's price exists
          if (px == null || cashPos.value < b.amount) continue;
          let pos = cashAcc.positions.find((p) => p.symbol === b.symbol && p.shares != null);
          if (!pos) { pos = { symbol: b.symbol, cash: false, value: 0, shares: 0, base: 0 }; cashAcc.positions.push(pos); }
          pos.shares += b.amount / px; cashPos.value -= b.amount; spent += b.amount;
        }
        if (spent) buys.push({ date: d, amount: spent });
      }
    }
    let priceDay = null;
    const out = (useBase) => normalizeHoldings({ ...holdings, accounts: work.map((a) => ({ id: a.id, name: a.name, key: a.key, positions: a.positions.map((p) => {
      if (useBase) return { symbol: p.symbol, value: p.base, shares: p.shares != null && p.base ? p.base / priceOn(daily[p.symbol], asof) : undefined };
      if (p.shares == null) return { symbol: p.symbol, value: p.value };
      const ld = lastDay(p.symbol); if (!priceDay || ld > priceDay) priceDay = ld;
      return { symbol: p.symbol, value: p.shares * priceOn(daily[p.symbol], ld), shares: p.shares };
    }) })) });
    const est = out(false), base = out(true);
    const total = totalOf(aggregate(est));
    const bought = buys.reduce((s, b) => s + b.amount, 0);
    return { holdings: est, base, asof, priceDay, baseTotal, total, marketChange: total - baseTotal, buys, bought,
      missing: [...missing], changed: priceDay != null && (priceDay > asof || buys.length > 0) };
  }

  // ───────── statistics ─────────
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  function cov(a, b) {
    const ma = mean(a), mb = mean(b);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
    return a.length > 1 ? s / (a.length - 1) : 0;
  }
  /** Yearly covariance matrix for the listed keys. */
  function covMatrix(R, keys) { return keys.map((i) => keys.map((j) => cov(R[i], R[j]) * WEEKS)); }
  /** Variance and each item's share of it, for weights w and covariance S. */
  function decompose(w, S) {
    const Sw = S.map((row) => row.reduce((s, v, j) => s + v * w[j], 0));
    const variance = w.reduce((s, v, i) => s + v * Sw[i], 0);
    return { variance, shares: w.map((v, i) => (variance > 0 ? (v * Sw[i]) / variance : 0)) };
  }
  function maxDrawdown(returns) {
    let level = 1, peak = 1, worst = 0;
    for (const r of returns) { level *= 1 + r; if (level > peak) peak = level; worst = Math.min(worst, level / peak - 1); }
    return worst;
  }

  // ───────── risk by fund (uses each fund's own price history) ─────────
  /**
   * Portfolio volatility, a bad-month loss, sensitivity to the S&P 500, the worst fall of today's mix
   * over the loaded period, and each fund's share of the risk. Cash counts as zero risk.
   * Returns null when there isn't enough price history.
   */
  function fundRisk(positions, histories, benchmark = "^GSPC") {
    const total = totalOf(positions);
    const risky = positions.filter((p) => !FD.fundOf(p.symbol).cash);
    const symbols = risky.map((p) => p.symbol);
    const withBench = histories[benchmark] ? symbols.concat(symbols.includes(benchmark) ? [] : [benchmark]) : symbols;
    const a = align(histories, withBench);
    const used = a.used.filter((s) => symbols.includes(s));
    if (!used.length || a.weeks.length < 26 || !total) return null;
    const w = used.map((s) => risky.find((p) => p.symbol === s).value / total);
    const { variance, shares } = decompose(w, covMatrix(a.R, used));
    const port = a.weeks.map((_, t) => used.reduce((s, sym, i) => s + w[i] * a.R[sym][t], 0));
    const vol = Math.sqrt(variance);
    const bench = a.R[benchmark];
    const out = {
      vol, total, weeks: a.weeks.length,
      badMonthPct: (Z95 * vol) / Math.sqrt(12), badMonth: ((Z95 * vol) / Math.sqrt(12)) * total,
      beta: bench ? cov(port, bench) / (cov(bench, bench) || 1) : null,
      maxDrawdown: maxDrawdown(port),
      shares: {}, vols: {},
      missing: symbols.filter((s) => !used.includes(s)),
    };
    used.forEach((s, i) => { out.shares[s] = shares[i]; out.vols[s] = Math.sqrt(cov(a.R[s], a.R[s]) * WEEKS); });
    return out;
  }

  // ───────── risk by sector / asset bucket ─────────
  function assumedCov(ids) {
    const B = Object.fromEntries(FD.BUCKETS.map((b) => [b.id, b]));
    const corr = (x, y) => {
      if (x.id === y.id) return 1;
      const key = [x.group, y.group].sort().join("|");
      return FD.GROUP_CORR[key] ?? 0;
    };
    return ids.map((i) => ids.map((j) => B[i].vol * B[j].vol * corr(B[i], B[j])));
  }
  /**
   * Share of the money and share of the risk for every bucket. Uses the buckets' market proxies when
   * their history is loaded (`assumed: false`), otherwise fixed long-run assumptions (`assumed: true`).
   */
  function bucketRisk(bucketValues, histories) {
    const total = Object.values(bucketValues).reduce((a, b) => a + b, 0);
    const ids = FD.BUCKETS.map((b) => b.id).filter((id) => bucketValues[id] > 0);
    const risky = ids.filter((id) => id !== "cash");
    const w = risky.map((id) => bucketValues[id] / (total || 1));
    const proxyOf = Object.fromEntries(FD.BUCKETS.map((b) => [b.id, b.proxy]));
    const proxies = [...new Set(risky.map((id) => proxyOf[id]))];
    const a = align(histories || {}, proxies);
    let S, assumed = true;
    if (!a.missing.length && a.weeks.length >= 26) {
      S = risky.map((i) => risky.map((j) => cov(a.R[proxyOf[i]], a.R[proxyOf[j]]) * WEEKS));
      assumed = false;
    } else S = assumedCov(risky);
    const { variance, shares } = decompose(w, S);
    const rows = ids.map((id) => {
      const k = risky.indexOf(id);
      return { id, value: bucketValues[id], weight: bucketValues[id] / (total || 1), share: k >= 0 ? shares[k] : 0, vol: k >= 0 ? Math.sqrt(S[k][k]) : 0 };
    });
    return { rows, vol: Math.sqrt(variance), assumed, total, weeks: assumed ? 0 : a.weeks.length };
  }
  /** Splits the bucket risk shares back onto funds (used only when fund histories aren't available). */
  function fundSharesFromBuckets(positions, bucketRows) {
    const share = Object.fromEntries(bucketRows.map((r) => [r.id, r.value ? r.share / r.value : 0]));
    const out = {};
    for (const p of positions) {
      const w = normWeights(FD.fundOf(p.symbol).sectors);
      out[p.symbol] = Object.keys(w).reduce((s, b) => s + p.value * w[b] * (share[b] || 0), 0);
    }
    return out;
  }

  /** Every Yahoo symbol the page needs: the funds, the bucket proxies and the S&P 500. */
  function symbolsNeeded(positions) {
    const set = new Set(["^GSPC"]);
    const lt = lookThrough(positions);
    for (const p of positions) if (!FD.fundOf(p.symbol).cash) set.add(p.symbol);
    for (const b of FD.BUCKETS) if (b.proxy && lt.buckets[b.id] > 0) set.add(b.proxy);
    return [...set];
  }

  /** Symbols whose daily prices the estimate needs: held funds and the plan's funds. */
  function dailySymbols(holdings) {
    const set = new Set();
    for (const a of holdings.accounts) for (const p of a.positions) if (!FD.fundOf(p.symbol).cash) set.add(p.symbol);
    for (const b of (holdings.plan || { buys: [] }).buys) set.add(b.symbol);
    return [...set];
  }

  // ───────── Fidelity "Portfolio_Positions" CSV ─────────
  function csvRows(text) {
    const rows = []; let row = [], cur = "", q = false;
    const s = String(text).replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  /** Short fingerprint of an account number (FNV-1a, same as the server's), so renamed accounts keep their names. */
  function accountKey(number) {
    let h = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(number)) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
  /** Reads the positions file Fidelity exports (Positions → Download). Account numbers are not kept. `names`: fingerprint → name. */
  function importFidelityCSV(text, today, names = {}) {
    const rows = csvRows(text);
    const head = (rows[0] || []).map((h) => h.trim().toLowerCase());
    const col = (name) => head.indexOf(name);
    const iAcc = col("account name"), iNum = col("account number"), iSym = col("symbol"), iVal = col("current value"), iQty = col("quantity");
    if (iSym < 0 || iVal < 0) throw new Error("This does not look like a positions file (no Symbol / Current Value column).");
    const accounts = new Map();
    for (const r of rows.slice(1)) {
      if (r.length <= Math.max(iSym, iVal)) continue;
      if (iNum >= 0 && (!r[iNum] || r[iNum].trim().length > 14)) continue; // footer text
      let symbol = (r[iSym] || "").trim().toUpperCase().replace(/\*+$/, "");
      const value = Number((r[iVal] || "").replace(/[$,+\s]/g, ""));
      if (!symbol || /\s/.test(symbol) || !Number.isFinite(value) || value === 0) continue;
      const name = (iAcc >= 0 && r[iAcc].trim()) || "Account";
      const key = name + "|" + (iNum >= 0 ? r[iNum].trim() : "");
      const fp = iNum >= 0 && r[iNum].trim() ? accountKey(r[iNum].trim()) : null;
      if (!accounts.has(key)) accounts.set(key, { id: "h" + (accounts.size + 1), name: names[fp] || name, key: fp || undefined, positions: [] });
      const acc = accounts.get(key);
      const qty = iQty >= 0 ? Number((r[iQty] || "").replace(/[,\s]/g, "")) : NaN;
      const same = acc.positions.find((p) => p.symbol === symbol);
      if (same) { same.value += value; if (same.shares != null && qty > 0) same.shares += qty; else delete same.shares; }
      else acc.positions.push(qty > 0 ? { symbol, value, shares: qty } : { symbol, value });
    }
    const list = [...accounts.values()];
    const seen = {};
    for (const a of list) { seen[a.name] = (seen[a.name] || 0) + 1; if (seen[a.name] > 1) a.name += " " + seen[a.name]; }
    if (!list.length) throw new Error("No positions found in the file.");
    return normalizeHoldings({ asof: today, source: "Positions file (CSV)", note: "", accounts: list });
  }

  root.FR = { normalizeHoldings, aggregate, totalOf, lookThrough, parseHistory, weeklyReturns, align, cov, covMatrix, decompose,
    maxDrawdown, fundRisk, bucketRisk, fundSharesFromBuckets, symbolsNeeded, importFidelityCSV, normWeights,
    normalizePlan, accountKey, parseDaily, priceOn, estimate, dailySymbols };
})(globalThis);

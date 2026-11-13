// PUBLIC DEMO data layer. The private app talks to a small server on 127.0.0.1 that reads and writes a
// CSV file on disk; here the same CSV lives only in this browser (localStorage) and starts from
// fictional sample data. Every name and figure below is made up, and the dates are generated
// relative to today so the dashboard always looks current.
(function (root) {
  "use strict";
  const FE = root.FE;
  const KEY = "finans-demo.data.v1";
  const state = { mode: "browser", rev: null, savedAt: null, sync: null };

  const BANKS = [
    { key: "hysa", name: "High-Yield Savings", kind: "saving", hidden: false },
    { key: "everyday", name: "Everyday Checking", kind: "checking", hidden: false },
  ];

  /** Small deterministic PRNG so the sample data is the same on every visit. */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

  /** Twice-a-month entries (15th and month end) for ~3.5 years, ending at the latest entry day before today. */
  function sampleRecords() {
    const rand = rng(1234);
    const end = FE.recordDayOnOrBefore(FE.addDays(FE.today(), -5));
    const dates = [];
    for (let d = FE.recordDayOnOrBefore(FE.addMonths(end, -42)); d <= end; d = FE.nextRecordDay(d)) dates.push(d);

    let brokerage = 96000, hysa = 42000, everyday = 14500;
    const out = [];
    dates.forEach((date, i) => {
      const r = FE.emptyRecord(date);
      if (i > 0) {
        const t = i / dates.length;
        // Brokerage: a contribution on most month-end entries plus a market return with real dips.
        const monthEnd = date.slice(8) !== "15";
        const contribution = monthEnd ? Math.round((3000 + 2500 * t) / 100) * 100 : 0;
        let ret = 0.0045 + 0.019 * gauss(rand);
        if (i > dates.length * 0.28 && i < dates.length * 0.33) ret -= 0.022; // a correction
        brokerage = brokerage * (1 + ret) + contribution;
        if (contribution) r.fidelity_transfer_in = contribution;
        // Savings: steady deposits plus interest; checking wobbles around a slowly rising base.
        hysa = hysa * (1 + 0.042 / 24) + (monthEnd ? 1700 + 1400 * t : 600);
        everyday = Math.max(6000, everyday + 900 * gauss(rand) + 120);
      }
      r.fidelity = Math.round(brokerage);
      r.banks = { hysa: Math.round(hysa), everyday: Math.round(everyday) };
      r.cash = 3000;
      // Money lent to a friend for a while, then paid back.
      if (i >= Math.floor(dates.length * 0.45) && i < Math.floor(dates.length * 0.6)) r.borc = 8000;
      if (i === Math.floor(dates.length * 0.45)) r.note = "Lent $8,000 to a friend (sample note)";
      if (i === Math.floor(dates.length * 0.6)) r.note = "Loan repaid in full";
      out.push(FE.applyBreakdownRule(r, FE.kindsOf(BANKS)));
    });
    return out;
  }

  /** Adds a 1-year plan after the latest entry, the same way the app's plan generator does by default. */
  function withPlan(records) {
    const base = records[records.length - 1];
    const model = FE.trendModel(records, 24, 0.07);
    const rows = FE.generatePlan(base, FE.addMonths(base.date, 12), "semimonthly", {
      annualReturn: 0.07, monthlyTransfer: model ? model.contribution : 0, monthlySavings: model ? model.bankMonthly : 0,
    });
    return records.concat(rows);
  }

  function sampleCSV() { return FE.exportCSV(withPlan(sampleRecords()), BANKS.map((b) => b.key)); }

  const storage = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
    clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };

  function normalizeBanks(banks) {
    const list = Array.isArray(banks) && banks.length ? banks : BANKS;
    return list.map((b) => ({ key: b.key, name: b.name || FE.defaultName(b.key), kind: b.kind === "saving" ? "saving" : "checking", hidden: !!b.hidden }));
  }
  /** Adds banks for columns found in the data but missing from the list. */
  function reconcile(records, banks) {
    const known = new Set(banks.map((b) => b.key));
    const extra = new Set();
    for (const r of records) for (const k of Object.keys(r.banks)) if (!known.has(k)) extra.add(k);
    return banks.concat(FE.sortKeys(extra).map((k) => ({ key: k, name: FE.defaultName(k), kind: FE.defaultKind(k), hidden: false })));
  }

  async function load() {
    let saved = storage.get();
    if (!saved || typeof saved.csv !== "string") saved = { csv: sampleCSV(), banks: BANKS };
    const parsed = FE.importAny(saved.csv);
    state.savedAt = saved.savedAt || null;
    return { records: parsed.records, banks: reconcile(parsed.records, normalizeBanks(saved.banks)), rejected: parsed.rejected };
  }
  async function loadIfChanged() { return null; }

  async function save(records, banks) {
    const csv = FE.exportCSV(records, banks.map((b) => b.key));
    state.savedAt = new Date().toISOString();
    if (!storage.set({ csv, banks, savedAt: state.savedAt })) throw new Error("this browser does not allow local storage");
  }
  async function reset() { storage.clear(); try { localStorage.removeItem("finans-demo.holdings.v1"); } catch { /* ignore */ } state.savedAt = null; }
  async function refreshSync() { /* no sync in the demo */ }

  // Market quotes: the private app fetches them from Yahoo Finance through its local server. Browsers
  // can't call Yahoo directly, so the demo shows a stable, made-up month of prices instead.
  const SAMPLE_QUOTES = { "^GSPC": [6800, 0.009], "BTC-USD": [98000, 0.028], "EURUSD=X": [1.12, 0.004], "IAU": [62, 0.011] };
  async function quote(symbol) {
    const [base, vol] = SAMPLE_QUOTES[symbol] || [100, 0.01];
    const rand = rng([...symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const now = Date.now(), points = [];
    let p = base;
    for (let i = 21; i >= 0; i--) { p *= 1 + 0.0008 + vol * gauss(rand); points.push({ t: now - i * 864e5, close: p }); }
    const prev = points[points.length - 2].close, price = points[points.length - 1].close;
    return { price, changePercent: ((price - prev) / prev) * 100, time: now, points };
  }

  // ───────── Holdings page: fictional fund positions and generated prices ─────────
  // The private app keeps the fund list in a file, imports the broker's positions CSV from the
  // Downloads folder and reads real prices. Here the positions are made up and every price series is
  // generated (same series on every visit), so the risk figures are illustrative, not market data.
  const HKEY = "finans-demo.holdings.v1";
  // [start price, yearly volatility, how strongly it follows the stock market, own factor]
  const PRICES = {
    FXAIX: [215, 0.16, 1.0], FZILX: [14, 0.15, 0.85], FPADX: [13, 0.19, 0.9], VOOG: [330, 0.21, 1.2], AVUV: [95, 0.22, 1.05],
    LIT: [45, 0.36, 1.0], DBMF: [27, 0.11, 0.0], IAU: [52, 0.16, 0.05, "gold"], FBTC: [55, 0.55, 1.3, "btc"],
    "^GSPC": [5600, 0.155, 1.0], XLK: [210, 0.25, 1.3], XLF: [45, 0.19, 0.95], XLC: [90, 0.2, 1.05], XLY: [190, 0.22, 1.15],
    XLV: [140, 0.15, 0.65], XLI: [125, 0.18, 0.95], XLP: [78, 0.13, 0.5], XLE: [88, 0.25, 0.75], XLB: [85, 0.2, 0.9],
    XLU: [70, 0.17, 0.45], XLRE: [40, 0.2, 0.75], SLV: [28, 0.3, 0.3, "gold"], "BTC-USD": [62000, 0.55, 1.3, "btc"], AGG: [98, 0.06, 0.1],
  };
  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  let factorCache = null, seriesCache = {};
  /** Weekdays for about 25 months ending today, with the shared market, gold and bitcoin daily moves. */
  function factors() {
    if (factorCache) return factorCache;
    const rand = rng(20261113), days = [];
    const end = Date.parse(FE.today() + "T00:00:00Z");
    for (let t = end - 760 * 864e5; t <= end; t += 864e5) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(dayOf(t)); }
    const mk = (drift, vol) => days.map(() => drift + (vol / Math.sqrt(252)) * gauss(rand));
    factorCache = { days, market: mk(0.0004, 0.155), gold: mk(0.0004, 0.15), btc: mk(0.0005, 0.5) };
    return factorCache;
  }
  /** Daily closes for one symbol: its market loading plus its own noise (or the gold / bitcoin factor). */
  function dailySeries(symbol) {
    if (seriesCache[symbol]) return seriesCache[symbol];
    const [start, vol, beta, own] = PRICES[symbol] || [100, 0.2, 1.0];
    const f = factors(), rand = rng([...symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 11));
    const idio = Math.sqrt(Math.max(vol * vol - (own ? 0 : beta * 0.155) ** 2, 0.0009) / 252);
    let p = start;
    const out = f.days.map((day, i) => {
      const move = own ? f[own][i] * (vol / (own === "gold" ? 0.15 : 0.5)) + 0.15 * beta * f.market[i] : beta * f.market[i] + idio * gauss(rand);
      p *= 1 + move;
      return { day, close: p };
    });
    return (seriesCache[symbol] = out);
  }
  async function daily(symbol) { return dailySeries(symbol).slice(-130); }
  /** Weekly closes in the same shape the private app builds from Yahoo data. */
  async function history(symbol) {
    const byWeek = new Map();
    for (const p of dailySeries(symbol)) byWeek.set(Math.floor((Date.parse(p.day + "T12:00:00Z") / 864e5 + 3) / 7), p.close);
    return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, close]) => ({ week, close }));
  }

  /** A made-up fund list worth about the latest brokerage entry, dated 12 days ago, with share counts and a weekly plan. */
  function sampleHoldings() {
    const records = sampleRecords(), total = records[records.length - 1].fidelity;
    const asof = FE.addDays(FE.today(), -12);
    const px = (sym) => { const s = dailySeries(sym); let c = s[0].close; for (const p of s) { if (p.day > asof) break; c = p.close; } return c; };
    const pos = (symbol, weight) => { const value = Math.round(total * weight); return symbol === "SPRXX" ? { symbol, value } : { symbol, value, shares: +(value / px(symbol)).toFixed(3) }; };
    return {
      asof, source: "Sample positions (fictional)", note: "",
      accounts: [
        { id: "main", name: "Main account", positions: [pos("FXAIX", 0.26), pos("IAU", 0.1), pos("VOOG", 0.1), pos("FZILX", 0.08), pos("FBTC", 0.05), pos("AVUV", 0.04)] },
        { id: "weekly", name: "Weekly auto-invest", positions: [pos("SPRXX", 0.1), pos("FXAIX", 0.08), pos("FZILX", 0.08), pos("FPADX", 0.06), pos("AVUV", 0.02), pos("FBTC", 0.01), pos("LIT", 0.01), pos("DBMF", 0.01)] },
      ],
      plan: { weekday: 3, buys: [{ symbol: "FXAIX", amount: 250 }, { symbol: "FZILX", amount: 150 }, { symbol: "FPADX", amount: 60 }, { symbol: "AVUV", amount: 60 }, { symbol: "IAU", amount: 50 }, { symbol: "FBTC", amount: 30 }] },
    };
  }
  async function loadHoldings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(HKEY) || "null"); } catch { /* start from the sample */ }
    const holdings = saved && Array.isArray(saved.accounts) ? saved : sampleHoldings();
    return { holdings, rev: JSON.stringify(holdings).length + ":" + (holdings.asof || ""), watch: null };
  }
  async function saveHoldings(holdings) {
    try { localStorage.setItem(HKEY, JSON.stringify(holdings)); } catch { throw new Error("this browser does not allow local storage"); }
    return JSON.stringify(holdings).length + ":" + (holdings.asof || "");
  }

  root.Store = { load, loadIfChanged, save, reset, quote, refreshSync, loadHoldings, saveHoldings, history, daily, state, isLocalHost: false, isDemo: true };
})(globalThis);

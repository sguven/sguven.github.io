// Finance web UI (public demo) — a simple, clear finance dashboard on top of the shared engine (FE)
// and the Store (browser storage in this demo). Pages: Overview, Accounts, Holdings, Records, Analysis, Settings.
(function () {
  "use strict";
  const FE = globalThis.FE, Store = globalThis.Store;

  // ───────────────────────── helpers ─────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = {
    get(k, d = null) { try { const v = localStorage.getItem("finans-demo." + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("finans-demo." + k, v); } catch { /* private mode */ } },
  };
  const tone = (v) => (v == null || Math.round(v) === 0 ? "muted" : v < 0 ? "neg" : "pos");
  const money = (v, { signed = false, colored = false, hide = S.hide } = {}) =>
    `<span class="num ${colored && !hide ? tone(v) : ""}">${hide ? "••••••" : FE.money(v, signed)}</span>`;
  const pctTxt = (v, base, signed = true) => (base ? FE.pct(v / base, signed) : "—");
  const todayS = () => FE.today();
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function parseAmount(s) {
    if (s == null) return null;
    let t = String(s).replace(/[\s$]/g, "");
    if (!t) return null;
    if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
    else if (/,\d{1,2}$/.test(t)) t = t.replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const fmtInput = (v) => (v == null ? "" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v));
  let toastTimer;
  function toast(msg, ms = 2200) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ───────────────────────── state ─────────────────────────
  const TABS = ["overview", "accounts", "fidelity", "records", "analysis", "settings"];
  const S = {
    records: [], banks: [], rows: [],
    tab: TABS.includes(ls.get("tab")) ? ls.get("tab") : "overview",
    range: ls.get("range", "1Y"), hide: ls.get("hide") === "1",
    account: ls.get("account", "total"), search: "",
    quotes: {}, quotesAt: null, quotesErr: null, quotesLoading: false,
  };
  /**
   * Adds r.change (total minus the previous row's total) and r.avg30: the average increase per
   * 30 days since the first record that has any money in it (the empty starting row is skipped).
   */
  function withChanges(rows) {
    const start = rows.find((r) => r.total > 0);
    rows.forEach((r, i) => {
      r.change = i ? r.total - rows[i - 1].total : null;
      const days = start ? FE.daysBetween(start.date, r.date) : 0;
      r.avg30 = days > 0 ? ((r.total - start.total) / days) * 30 : null;
    });
    return rows;
  }
  const recompute = () => { S.rows = withChanges(FE.compute(S.records)); };
  /** Increase between two actual rows. */
  function period(label, from, to) {
    if (!from || !to || from === to) return { label, empty: true };
    return { label, from, to, change: to.total - from.total, base: from.total };
  }
  /** Standard comparison periods ending at the latest actual record. */
  function periods(l) {
    const act = actualRows(), prev = FE.previousOf(S.rows, l);
    const yStart = [...act].reverse().find((r) => FE.year(r.date) < FE.year(l.date)) || act[0];
    return [period("Last period", prev, l), period(`This year (${FE.year(l.date)})`, yStart, l), period("Last 12 months", FE.yearAgo(S.rows, l), l), { ...period("Since first entry", act.find((r) => r.total > 0) || act[0], l), base: null }];
  }
  /** Total and monthly average increase over the 12 months up to `end`. */
  function last12(rows, end) {
    const win = rows.filter((r) => !r.isPlan && r.change != null && r.date > FE.addMonths(end, -12) && r.date <= end);
    if (!win.length) return null;
    const total = win.reduce((a, r) => a + r.change, 0);
    return { total, monthly: total / 12 };
  }
  const kinds = () => FE.kindsOf(S.banks);
  const bankName = (k) => (S.banks.find((b) => b.key === k) || { name: FE.defaultName(k) }).name;
  const PALETTE = ["#6a5acd", "#13b5c4", "#e0383e", "#f08c1e", "#2f7cf6", "#9b59d0", "#e84393", "#20c997", "#a0522d", "#17a2b8", "#f4c20d", "#8e8e93"];
  const bankColor = (k) => PALETTE[Math.max(S.banks.findIndex((b) => b.key === k), 0) % PALETTE.length];
  const GROUP = { fidelity: "#18a058", banks: "#2f7cf6", borc: "#f08c1e", cash: "#8e8e93" };
  // Bank kinds (saving/checking) still exist in the data for the iOS app; the web shows banks as one group.
  const bankTotal = (rec) => (rec.saving || 0) + (rec.checking || 0);
  const actualRows = () => S.rows.filter((r) => !r.isPlan);
  const latest = () => FE.latestActual(S.rows);

  async function commit(records, banks, message, opts = {}) {
    toast("Saving…", 20000);
    try {
      await Store.save(records, banks, message, opts);
      S.records = records; S.banks = banks; recompute();
      toast("Saved");
      return true;
    } catch (e) {
      toast("Could not save: " + e.message, 5000);
      return false;
    }
  }

  // ───────────────────────── accounts model ─────────────────────────
  /** Every account and group the user can drill into, in display order. */
  function accounts() {
    const rec = S.records;
    const used = (key) => rec.some((r) => (r.banks[key] || 0) !== 0);
    const banks = S.banks.filter((b) => !b.hidden || used(b.key));
    const bankAcc = (b) => ({ id: "bank:" + b.key, name: b.name + (b.hidden ? " (removed)" : ""), color: bankColor(b.key), sub: true,
      get: (r) => (r.record.banks[b.key] ?? null) });
    return [
      { id: "total", name: "Total net worth", color: css("--accent") || "#23b46e", get: (r) => r.total, head: true },
      { id: "fidelity", name: "Brokerage", color: GROUP.fidelity, get: (r) => r.record.fidelity, head: true },
      { id: "banks", name: "Banks", color: GROUP.banks, get: (r) => bankTotal(r.record), head: true },
      ...banks.map(bankAcc),
      { id: "borc", name: "Receivables", color: GROUP.borc, get: (r) => r.record.borc ?? 0, head: true },
      { id: "cash", name: "Cash", color: GROUP.cash, get: (r) => r.record.cash ?? 0, head: true },
    ];
  }

  // ───────────────────────── charts ─────────────────────────
  let charts = [];
  const destroyCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
  const dn = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayLabel = (n) => { const d = new Date(n * 864e5); return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; };
  const fullDay = (n) => { const d = new Date(n * 864e5); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
  const shortMoney = (v) => (S.hide ? "•••" : Math.abs(v) >= 1000 ? `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 1000)}K` : `$${Math.round(v)}`);
  const cutoff = () => ({ "6M": FE.addMonths(todayS(), -6), "1Y": FE.addMonths(todayS(), -12), "3Y": FE.addMonths(todayS(), -36) }[S.range] || null);
  const inRange = (r) => { const c = cutoff(); return !c || r.date >= c; };

  function baseOptions(extra = {}) {
    const grid = css("--line"), ink = css("--muted");
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 10 } },
      scales: {
        x: { type: "linear", grid: { color: grid }, ticks: { color: ink, maxTicksLimit: 6, callback: (v) => dayLabel(v) } },
        y: { grid: { color: grid }, ticks: { color: ink, maxTicksLimit: 5, callback: (v) => shortMoney(v) } },
      },
      ...extra,
    };
  }
  function fitX(options, xs) {
    if (xs.length) options.scales.x = { ...options.scales.x, min: Math.min(...xs), max: Math.max(...xs) };
    return options;
  }
  const todayLine = {
    id: "todayLine",
    afterDatasetsDraw(chart) {
      const x = chart.scales.x.getPixelForValue(dn(todayS()));
      if (x < chart.chartArea.left || x > chart.chartArea.right) return;
      const c = chart.ctx; c.save(); c.strokeStyle = css("--orange"); c.setLineDash([3, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, chart.chartArea.top); c.lineTo(x, chart.chartArea.bottom); c.stroke();
      c.fillStyle = css("--orange"); c.font = "11px -apple-system, sans-serif"; c.fillText("today", x + 4, chart.chartArea.top + 10); c.restore();
    },
  };

  /** Line chart for one account (actual solid, plan dashed when the account has plan values). */
  function lineChart(canvas, acc, { plan = true } = {}) {
    const vis = S.rows.filter(inRange);
    const act = vis.filter((r) => !r.isPlan && acc.get(r) != null);
    const plans = plan ? vis.filter((r) => r.isPlan && acc.get(r) != null) : [];
    const planPts = plans.length && act.length ? [act[act.length - 1]].concat(plans) : plans;
    const color = acc.color;
    charts.push(new Chart(canvas, {
      type: "line",
      data: { datasets: [
        { label: "Actual", data: act.map((r) => ({ x: dn(r.date), y: acc.get(r) })), borderColor: color, borderWidth: 2.5, pointRadius: 0, pointHitRadius: 8, tension: 0.25,
          fill: { target: "origin", above: color + "18" } },
        { label: "Plan", data: planPts.map((r) => ({ x: dn(r.date), y: acc.get(r) })), borderColor: css("--faint"), borderDash: [5, 4], borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.25 },
      ] },
      options: fitX(baseOptions({
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => fullDay(it[0].parsed.x), label: (it) => `${it.dataset.label}: ${S.hide ? "••••••" : FE.money(it.parsed.y)}` } } },
      }), act.concat(planPts).map((r) => dn(r.date))),
      plugins: [todayLine],
    }));
  }

  function donutChart(canvas, groups) {
    charts.push(new Chart(canvas, {
      type: "doughnut",
      data: { labels: groups.map((g) => g.name), datasets: [{ data: groups.map((g) => Math.max(g.value, 0)), backgroundColor: groups.map((g) => g.color), borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "68%", animation: { duration: 350 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => {
          const tot = it.dataset.data.reduce((a, b) => a + b, 0);
          return ` ${it.label}: ${S.hide ? "••••••" : FE.money(it.parsed)} (${FE.pct(tot ? it.parsed / tot : 0)})`; } } } } },
    }));
  }

  function barChart(canvas, rows, get, label) {
    charts.push(new Chart(canvas, {
      type: "bar",
      data: { datasets: [{ label, data: rows.map((r) => ({ x: dn(r.date), y: get(r) })), backgroundColor: rows.map((r) => (get(r) < 0 ? css("--red") : css("--green"))), barThickness: 5, borderRadius: 2 }] },
      options: fitX(baseOptions({ scales: { x: { ...baseOptions().scales.x, offset: true }, y: baseOptions().scales.y },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => fullDay(it[0].parsed.x), label: (it) => `${label}: ${FE.money(it.parsed.y, true)}` } } } }), rows.map((r) => dn(r.date))),
    }));
  }

  function allocationChart(canvas) {
    const rows = actualRows().filter(inRange);
    const parts = [["Brokerage", GROUP.fidelity, (r) => r.record.fidelity], ["Banks", GROUP.banks, (r) => bankTotal(r.record)], ["Receivables", GROUP.borc, (r) => r.record.borc || 0], ["Cash", GROUP.cash, (r) => r.record.cash || 0]];
    charts.push(new Chart(canvas, {
      type: "line",
      data: { datasets: parts.map(([label, color, f], i) => ({ label, data: rows.map((r) => ({ x: dn(r.date), y: Math.max(f(r), 0) })), borderColor: color, backgroundColor: color + "cc",
        fill: i === 0 ? "origin" : "-1", pointRadius: 0, pointHitRadius: 6, borderWidth: 1, tension: 0.2 })) },
      options: fitX(baseOptions({
        scales: { x: baseOptions().scales.x, y: { ...baseOptions().scales.y, stacked: true, min: 0 } },
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: css("--muted") } },
          tooltip: { itemSort: (a, b) => b.datasetIndex - a.datasetIndex, callbacks: {
            title: (it) => fullDay(it[0].parsed.x),
            label: (it) => { const tot = it.chart.data.datasets.reduce((s, d) => s + (d.data[it.dataIndex]?.y || 0), 0); return ` ${it.dataset.label}: ${FE.money(it.parsed.y)} (${FE.pct(tot ? it.parsed.y / tot : 0)})`; },
            footer: (it) => "Total: " + FE.money(it[0].chart.data.datasets.reduce((s, d) => s + (d.data[it[0].dataIndex]?.y || 0), 0)) } } },
      }), rows.map((r) => dn(r.date))),
    }));
  }

  // ───────────────────────── shared pieces ─────────────────────────
  const rangeSeg = (extra = "") => `<div class="seg ${extra}">${["6M", "1Y", "3Y", "All"].map((r) => `<button class="${S.range === r ? "on" : ""}" data-action="range" data-range="${r}">${r}</button>`).join("")}</div>`;
  function pageHead(title, sub, actions = "") {
    return `<div class="page-head"><div><h1 class="title">${title}</h1>${sub ? `<div class="muted small">${sub}</div>` : ""}</div><div class="row">${actions}</div></div>`;
  }
  const hideBtn = () => `<button class="btn small" data-action="hide" title="${S.hide ? "Show amounts" : "Hide amounts"}">${S.hide ? "🙈 Hidden" : "👁 Show"}</button>`;
  const newBtn = () => `<button class="btn small primary" data-action="new">＋ New entry</button>`;
  function kpi(label, value, sub = "", extra = "") {
    return `<div class="card kpi ${extra}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ""}</div>`;
  }
  function lastRecordLine() {
    const l = latest(); if (!l) return "";
    const days = FE.daysBetween(l.date, todayS());
    const next = FE.checkIn(l.date, todayS());
    return `Last entry ${FE.dateTR(l.date)} (${days} ${days === 1 ? "day" : "days"} ago) · Next entry due ${FE.dateTR(next.state === "upcoming" ? next.due : FE.suggestedDate(l.date, todayS()))}`;
  }
  function groupsOf(l) {
    const r = l.record;
    return [
      { id: "fidelity", name: "Brokerage", color: GROUP.fidelity, value: r.fidelity },
      ...(FE.hasBreakdown(r)
        ? FE.orderedKeys(S.banks.map((b) => b.key), [r]).map((k) => ({ id: "bank:" + k, name: bankName(k), color: bankColor(k), value: r.banks[k] || 0 }))
        : [{ id: "banks", name: "Banks", color: GROUP.banks, value: bankTotal(r) }]),
      { id: "borc", name: "Receivables", color: GROUP.borc, value: r.borc || 0 },
      { id: "cash", name: "Cash", color: GROUP.cash, value: r.cash || 0 },
    ].filter((g) => g.value !== 0);
  }

  // ───────────────────────── Overview ─────────────────────────
  function overviewView() {
    const l = latest();
    if (!l) return pageHead("Overview", "No entries yet", newBtn()) + `<div class="card"><p class="muted">Add your first entry, or restore the sample data in Settings.</p></div>`;
    const prev = FE.previousOf(S.rows, l), ago = FE.yearAgo(S.rows, l);
    const avg = last12(S.rows, l.date);
    const groups = groupsOf(l), tot = l.total, pers = periods(l);
    return `${pageHead("Overview", lastRecordLine(), hideBtn() + newBtn())}
      <div class="grid">
        ${kpi("Total net worth", money(tot), `Digital ${money(l.digital)} · Receivables + cash ${money((l.record.borc || 0) + (l.record.cash || 0))}`, "s3 kpi-main")}
        ${kpi("Last period", prev ? money(tot - prev.total, { signed: true, colored: true }) : "—",
          prev ? `${pctTxt(tot - prev.total, prev.total)} · ${l.days} days` : "", "s3")}
        ${kpi("Last 12 months", ago ? money(tot - ago.total, { signed: true, colored: true }) : "—",
          ago ? `${pctTxt(tot - ago.total, ago.total)} · since ${FE.dateTR(ago.date)}` : "No data from a year ago", "s3")}
        ${kpi("Avg. monthly growth", money(avg && avg.monthly, { signed: true, colored: true }), "12-month average", "s3")}

        <div class="card s8"><div class="card-head"><h2 class="card-title">Total net worth</h2>${rangeSeg("mini")}</div>
          <div class="chart-box tall"><canvas id="c-total"></canvas></div><div class="tiny muted">Solid line actual, dashed line plan${S.records.some((r) => r.status === "plan") && planLabel(planSettings()) ? ` (${planLabel(planSettings())})` : ""} · <button class="link" data-action="plan">Extend / shorten plan</button></div></div>
        <div class="card s4"><h2 class="card-title">Allocation</h2>
          <div class="donut-box"><canvas id="c-donut"></canvas><div class="donut-center"><div class="tiny muted">Total</div><b>${S.hide ? "••••••" : FE.short(tot)}</b></div></div>
          <div class="legend">${groups.map((g) => `<button class="legend-row" data-action="account" data-id="${g.id}"><i class="swatch" style="background:${g.color}"></i><span class="grow">${g.name}</span><span class="muted small">${FE.pct(g.value / tot)}</span><span class="amt">${money(g.value)}</span></button>`).join("")}</div></div>

        <div class="card s7"><div class="card-head"><h2 class="card-title">Accounts</h2><button class="link small" data-action="tab" data-tab="accounts">All ›</button></div>${accountsTable(l, prev)}</div>
        <div class="card s5"><h2 class="card-title">How much did it grow?</h2>${increaseTable(pers)}
          <div class="tiny muted" style="margin-top:12px">Growth per entry · last 12 months</div><div class="chart-box"><canvas id="c-flow"></canvas></div></div>

        <div class="s12" id="market">${marketCard()}</div>
      </div>`;
  }

  function increaseTable(pers) {
    return `<table class="mini-table"><thead><tr><th>Period</th><th>Growth</th><th>%</th></tr></thead><tbody>
      ${pers.map((p) => p.empty ? "" : `<tr><td>${p.label}<div class="tiny faint">${FE.dateTR(p.from.date)} → ${FE.dateTR(p.to.date)}</div></td><td class="bold">${money(p.change, { signed: true, colored: true })}</td><td class="muted">${p.base ? pctTxt(p.change, p.base) : ""}</td></tr>`).join("")}</tbody></table>`;
  }

  function accountsTable(l, prev) {
    const accs = accounts().filter((a) => a.id !== "total");
    const rows = accs.map((a) => {
      const v = a.get(l), p = prev ? a.get(prev) : null;
      if (!a.head && !v && !p) return "";
      const ch = v != null && p != null ? v - p : null;
      return `<tr class="row-link ${a.sub ? "sub" : ""}" data-action="account" data-id="${a.id}">
        <td><i class="swatch" style="background:${a.color}"></i> ${esc(a.name)}</td><td>${money(v)}</td><td class="muted">${l.total && v != null ? FE.pct(v / l.total) : ""}</td>
        <td>${ch != null && Math.round(ch) !== 0 ? money(ch, { signed: true, colored: true }) : '<span class="faint">—</span>'}</td></tr>`;
    }).join("");
    return `<table class="mini-table"><thead><tr><th>Account</th><th>Amount</th><th>Share</th><th>Change</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${money(l.total)}</td><td></td><td>${prev ? money(l.total - prev.total, { signed: true, colored: true }) : ""}</td></tr></tfoot></table>`;
  }

  // Market
  function sparkline(points, up) {
    if (!points || points.length < 2) return "";
    const ys = points.map((p) => p.close), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const d = points.map((p, i) => `${(i / (points.length - 1)) * 70},${26 - ((p.close - min) / span) * 24}`).join(" ");
    return `<svg viewBox="0 0 70 28" aria-hidden="true"><polyline fill="none" stroke="${up ? css("--green") : css("--red")}" stroke-width="1.5" points="${d}"/></svg>`;
  }
  function priceText(v, m) {
    if (v == null) return "—";
    const digits = m.style === "rate" ? 4 : m.style === "points" || v < 1000 ? 2 : 0;
    const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    return m.style === "usd" ? "$" + s : s;
  }
  function marketCard() {
    return `<div class="card"><div class="card-head"><h2 class="card-title">Markets</h2><div class="row"><span class="tiny muted">Sample prices in this demo · the private version shows live Yahoo Finance quotes</span><button class="icon-btn" data-action="quotes" aria-label="Refresh">${S.quotesLoading ? "⏳" : "↻"}</button></div></div>
      <div class="market-grid">${FE.MARKETS.map((m) => { const q = S.quotes[m.id]; const first = q && q.points[0];
        const up = q && first ? q.price >= first.close : true; const ch = q ? q.changePercent : null;
        return `<div class="mkt"><div class="grow"><div class="bold">${m.name}</div><div class="tiny muted">${m.detail}</div></div>${q ? sparkline(q.points, up) : ""}
          <div class="right"><div class="bold num">${q ? priceText(q.price, m) : "—"}</div><div class="small num ${ch == null ? "muted" : ch < 0 ? "neg" : "pos"}">${ch == null ? "—" : (ch < 0 ? "−" : "+") + Math.abs(ch).toFixed(2) + "%"}</div></div></div>`; }).join("")}</div>
      ${S.quotesErr ? `<div class="tiny neg">${esc(S.quotesErr)}</div>` : ""}</div>`;
  }
  async function loadQuotes(force = false) {
    if (S.quotesLoading || (!force && S.quotesAt && Date.now() - S.quotesAt < 300000)) return;
    S.quotesLoading = true; refreshMarket();
    const res = await Promise.allSettled(FE.MARKETS.map((m) => Store.quote(m.symbol, "1mo")));
    res.forEach((r, i) => { if (r.status === "fulfilled") S.quotes[FE.MARKETS[i].id] = r.value; });
    const failed = res.filter((r) => r.status === "rejected").length;
    S.quotesErr = failed ? `${failed} ${failed === 1 ? "price" : "prices"} could not be loaded` : null;
    S.quotesAt = Date.now(); S.quotesLoading = false; refreshMarket();
  }
  function refreshMarket() { const el = $("#market"); if (el) el.innerHTML = marketCard(); }

  // ───────────────────────── Accounts ─────────────────────────
  function accountsView() {
    const l = latest();
    if (!l) return pageHead("Accounts") + `<div class="card muted">No entries.</div>`;
    const accs = accounts(), acc = accs.find((a) => a.id === S.account) || accs[0];
    const prev = FE.previousOf(S.rows, l), ago = FE.yearAgo(S.rows, l);
    const v = acc.get(l), pv = prev ? acc.get(prev) : null, av = ago ? acc.get(ago) : null;
    const hist = actualRows().filter((r) => acc.get(r) != null).slice(-12).reverse();
    const max = actualRows().reduce((m, r) => { const x = acc.get(r); return x != null && (!m || x > m.v) ? { v: x, date: r.date } : m; }, null);
    const list = accs.map((a) => {
      const x = a.get(l);
      if (!a.head && !x) return a.sub && S.records.some((r) => (r.banks[a.id.slice(5)] || 0) !== 0) ? listItem(a, x, true) : "";
      return listItem(a, x, false);
    }).join("");
    function listItem(a, x, dim) {
      return `<button class="acc-item ${a.id === acc.id ? "on" : ""} ${a.sub ? "sub" : ""} ${dim ? "dim" : ""}" data-action="account" data-id="${a.id}">
        <i class="swatch" style="background:${a.color}"></i><span class="grow ellipsis">${esc(a.name)}</span><span class="num">${money(x)}</span></button>`;
    }
    return `${pageHead("Accounts", "Pick an account to see its history and changes.", hideBtn())}
      <div class="grid">
        <div class="card s4 acc-list">${list}</div>
        <div class="s8 col">
          <div class="card"><div class="card-head"><div><div class="kpi-label"><i class="swatch" style="background:${acc.color}"></i> ${esc(acc.name)}</div>
            <div class="kpi-value big">${money(v)}</div>${acc.id === "fidelity" ? '<button class="link small" data-action="tab" data-tab="fidelity">Funds, contents and risk ›</button>' : ""}</div>${rangeSeg("mini")}</div>
            <div class="stat-row">
              <div><div class="tiny muted">Since previous entry</div><div class="bold">${pv != null && v != null ? money(v - pv, { signed: true, colored: true }) : "—"}</div><div class="tiny muted">${pv ? pctTxt(v - pv, pv) : ""}</div></div>
              <div><div class="tiny muted">Last 12 months</div><div class="bold">${av != null && v != null ? money(v - av, { signed: true, colored: true }) : "—"}</div><div class="tiny muted">${av ? pctTxt(v - av, av) : ""}</div></div>
              <div><div class="tiny muted">Share of total</div><div class="bold">${acc.id === "total" ? "100%" : l.total && v != null ? FE.pct(v / l.total, false) : "—"}</div></div>
              <div><div class="tiny muted">All-time high</div><div class="bold">${max ? money(max.v) : "—"}</div><div class="tiny muted">${max ? FE.dateTR(max.date) : ""}</div></div>
            </div>
            <div class="chart-box tall"><canvas id="c-acc"></canvas></div></div>
          <div class="card"><h2 class="card-title">Recent entries</h2>
            <table class="mini-table"><thead><tr><th>Date</th><th>Amount</th><th>Change</th>${acc.id === "fidelity" ? "<th>Transfer in</th>" : ""}</tr></thead><tbody>
            ${hist.map((r) => { const p = FE.previousOf(S.rows, r), pv2 = p ? acc.get(p) : null, ch = pv2 != null ? acc.get(r) - pv2 : null;
              return `<tr class="row-link" data-action="detail" data-date="${r.date}"><td>${FE.dateTR(r.date)}</td><td>${money(acc.get(r))}</td><td>${ch != null ? money(ch, { signed: true, colored: true }) : "—"}</td>
                ${acc.id === "fidelity" ? `<td>${r.record.fidelity_transfer_in ? money(r.record.fidelity_transfer_in) : '<span class="faint">—</span>'}</td>` : ""}</tr>`; }).join("")}
            </tbody></table></div>
        </div>
      </div>`;
  }

  // ───────────────────────── Records ─────────────────────────
  function recordsView() {
    return `${pageHead("Records", `${actualRows().length} actual, ${S.rows.length - actualRows().length} plan entries`, hideBtn() + newBtn())}
      <input class="search" style="max-width:420px" type="search" placeholder="Search by year or month (2026, September)" value="${esc(S.search)}" data-input="search">
      <div id="list">${recordsBody()}</div>`;
  }
  function recordsBody() {
    const q = S.search.trim().toLowerCase();
    const rows = S.rows.filter((r) => !q || FE.searchKey(r.date).includes(q));
    if (!rows.length) return `<p class="muted" style="text-align:center;padding:40px">${q ? "No results" : "No entries"}</p>`;
    const years = new Map(FE.yearSummaries(S.rows).map((y) => [y.year, y]));
    const by = new Map();
    for (const r of rows) { const y = FE.year(r.date); if (!by.has(y)) by.set(y, []); by.get(y).push(r); }
    const keys = [...by.keys()].sort((a, b) => b - a);
    const cell = (v, o) => `<td>${money(v, o)}</td>`;
    const table = `<div class="table-wrap only-desktop"><table class="records"><thead><tr><th>Date</th><th>Brokerage</th><th>Banks</th><th>Receivables</th><th>Cash</th><th>Total</th><th>Change</th></tr></thead>
      ${keys.map((y) => { const s = years.get(y);
        return `<tbody><tr class="year"><td colspan="5">${y}</td><td colspan="2">${s && s.annualIncrease != null ? `<span class="small muted">Annual growth</span> ${money(s.annualIncrease, { signed: true, colored: true })}` : ""}</td></tr>
          ${by.get(y).slice().reverse().map((r) => {
            return `<tr class="row-link ${r.isPlan ? "plan" : ""}" data-action="detail" data-date="${r.date}">
            <td>${FE.dateTR(r.date)} ${r.isPlan ? '<span class="pill plan">Plan</span>' : ""}${r.record.note ? ' <span title="' + esc(r.record.note) + '">📝</span>' : ""}</td>
            ${cell(r.record.fidelity)}${cell(bankTotal(r.record))}${cell(r.record.borc)}${cell(r.record.cash)}
            <td class="total">${money(r.total)}</td>${cell(r.change, { signed: true, colored: true })}</tr>`; }).join("")}</tbody>`; }).join("")}
    </table></div>`;
    const list = `<div class="only-mobile">${keys.map((y) => `<div class="year-head"><b>${y}</b></div><div class="list">${by.get(y).slice().reverse().map((r) => `<button class="item ${r.isPlan ? "plan" : ""}" data-action="detail" data-date="${r.date}">
        <div class="grow"><div class="bold">${FE.dateTR(r.date)}</div><div class="tiny muted">${r.isPlan ? '<span class="pill plan">Plan</span>' : r.days != null ? r.days + " days" : ""}</div></div>
        <div class="right"><div class="bold">${money(r.total)}</div><div class="tiny">${money(r.change, { signed: true, colored: true })}</div></div></button>`).join("")}</div>`).join("")}</div>`;
    return table + list;
  }

  // ───────────────────────── Analysis ─────────────────────────
  function analysisView() {
    const act = actualRows();
    const byYear = new Map();
    for (const r of act) { const y = FE.year(r.date); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); }
    let prevEnd = null;
    const years = [...byYear.keys()].sort((a, b) => a - b).map((y) => {
      const rs = byYear.get(y), last = rs[rs.length - 1];
      const out = { year: y, end: last.total, endDate: last.date, change: prevEnd == null ? null : last.total - prevEnd,
        start: prevEnd, count: rs.length };
      prevEnd = last.total;
      return out;
    }).reverse();
    const l = latest();
    const avg = l && last12(S.rows, l.date);
    const start = act.find((r) => r.total > 0);
    return `${pageHead("Analysis", "Growth by year and by period.", hideBtn())}
      <div class="grid">
        ${kpi("Growth, last 12 months", money(avg && avg.total, { signed: true, colored: true }), "", "s4")}
        ${kpi("Avg. monthly growth · last 12 months", money(avg && avg.monthly, { signed: true, colored: true }), "Last 12 months ÷ 12", "s4")}
        ${kpi("Avg. growth per 30 days · all time", money(l && l.avg30, { signed: true, colored: true }), start ? `Since the ${FE.dateTR(start.date)} entry` : "", "s4")}
        <div class="card s12"><h2 class="card-title">Years</h2>
          <div class="table-scroll"><table class="mini-table wide"><thead><tr><th>Year</th><th>Last entry of the year</th><th>Total</th><th>Annual growth</th><th>%</th><th>Entries</th></tr></thead><tbody>
          ${years.map((y) => `<tr><td class="bold">${y.year}</td><td class="muted">${FE.dateTR(y.endDate)}</td><td>${money(y.end)}</td><td>${y.change == null ? "—" : money(y.change, { signed: true, colored: true })}</td><td class="muted">${y.change == null ? "" : pctTxt(y.change, y.start)}</td><td class="muted">${y.count}</td></tr>`).join("")}
          </tbody></table></div><div class="tiny muted">Actual entries only. Annual growth = last entry of the year − last entry of the previous year.</div></div>
        <div class="s12">${rangeSeg()}</div>
        <div class="card s12"><h2 class="card-title">Growth per entry</h2><div class="chart-box"><canvas id="c-net"></canvas></div></div>
        <div class="card s12"><h2 class="card-title">Allocation over time</h2><div class="chart-box tall"><canvas id="c-alloc"></canvas></div><div class="tiny muted">Hover or tap the chart to see each account&rsquo;s amount and share on that date.</div></div>
      </div>`;
  }

  // ───────────────────────── Settings ─────────────────────────
  function settingsView() {
    const st = Store.state, visible = S.banks.filter((b) => !b.hidden), hidden = S.banks.filter((b) => b.hidden);
    const bankRow = (b, i) => `<div class="field"><label class="ellipsis"><button class="bold" data-action="bank-rename" data-key="${b.key}">${esc(b.name)}</button> <span class="tiny faint">${b.key}</span></label>
      <button class="icon-btn" data-action="bank-move" data-key="${b.key}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
      <button class="icon-btn" data-action="bank-move" data-key="${b.key}" data-dir="1" ${i === visible.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
      <button class="icon-btn" data-action="bank-remove" data-key="${b.key}" aria-label="Remove">✕</button></div>`;
    return `${pageHead("Settings")}<div class="settings-grid"><div>
      <div class="section-title">Demo data</div>
      <div class="list"><div class="kv"><span>Stored in</span><span>This browser only</span></div>
        <div class="kv"><span>Entries</span><span>${S.records.length}</span></div>
        <div class="kv"><span>Last saved</span><span>${st.savedAt ? new Date(st.savedAt).toLocaleString("en-US") : "—"}</span></div></div>
      <div class="row" style="margin-top:8px"><button class="btn small danger" data-action="reset-demo">↺ Restore sample data</button></div>
      <div class="note">This is a public demo with fictional figures. Your edits are kept only in this browser; restoring brings the sample data back.</div>
      <div class="section-title">Import / export</div>
      <div class="list"><button class="item" data-action="import"><span class="grow">⬇️ Import (CSV / JSON)</span></button>
        <button class="item" data-action="export" data-fmt="csv"><span class="grow">⬆️ Export · CSV</span></button>
        <button class="item" data-action="export" data-fmt="json"><span class="grow">⬆️ Export · JSON</span></button></div>
      <div class="note">Import updates entries by date and never deletes any; a preview comes first. Same file format as the iPhone app.</div>
      <div class="section-title">Plan</div>
      <div class="list"><button class="item" data-action="plan"><span class="grow">🗓 Update plan</span><span class="muted">›</span></button></div>
      <div class="section-title">Display</div>
      <div class="list"><div class="field"><label>Hide amounts</label><label class="switch"><input type="checkbox" data-input="hide" ${S.hide ? "checked" : ""}><i></i></label></div></div>
      </div><div>
      <div class="section-title">Banks</div>
      <div class="list">${visible.map(bankRow).join("")}
        <div class="field"><input class="grow" style="text-align:left;width:auto" placeholder="New bank name" data-input="newbank">
          <button class="btn small primary" data-action="bank-add">Add</button></div></div>
      ${hidden.length ? `<div class="note">Removed (past values are kept): ${hidden.map((b) => `${esc(b.name)} <button class="link" data-action="bank-restore" data-key="${b.key}">Restore</button>`).join(" · ")}</div>` : ""}
      <div class="note">Click a name to rename it, use the arrows to reorder. A removed bank keeps its past values.</div>
      <div class="note">The private version runs only on my own Mac and iPhone; nothing is sent anywhere.</div>
      </div></div>`;
  }

  // ───────────────────────── Holdings (funds, contents, risk) ─────────────────────────
  const FD = globalThis.FD, FR = globalThis.FR;
  /** Fund list + price histories for the Fidelity page. `hist` is filled lazily the first time the page opens. */
  const F = { holdings: null, error: null, hist: {}, failed: new Set(), loading: false,
    daily: {}, dailyFailed: new Set(), rev: null, watch: null, mode: ls.get("fid.mode") === "file" ? "file" : "est" };
  const BUCKET = Object.fromEntries(FD.BUCKETS.map((b) => [b.id, b]));
  const pct1 = (v, signed = false) => FE.pct(v, signed);

  async function loadHoldings() {
    try { const d = await Store.loadHoldings(); F.holdings = FR.normalizeHoldings(d.holdings); F.rev = d.rev; F.watch = d.watch || null; F.error = null; }
    catch (e) { F.holdings = null; F.error = e.message; }
  }
  /** Picks up a positions file the server imported from Downloads while the page was open. */
  async function pollHoldings() {
    if (S.tab !== "fidelity" || document.hidden || !$("#sheet").hidden || F.error) return;
    try {
      const d = await Store.loadHoldings();
      const watchChanged = JSON.stringify(d.watch && [d.watch.state, d.watch.message]) !== JSON.stringify(F.watch && [F.watch.state, F.watch.message]);
      F.watch = d.watch || null;
      if (d.rev !== F.rev) { F.rev = d.rev; F.holdings = FR.normalizeHoldings(d.holdings); toast("New positions file imported", 4000); render(); }
      else if (watchChanged) render();
    } catch { /* server restarting: try again next time */ }
  }
  setInterval(pollHoldings, 15000);
  /** Fetches the weekly price history for every symbol the page needs and doesn't have yet. */
  async function ensureHistories(force = false) {
    if (F.loading || !F.holdings) return;
    if (force) F.failed.clear();
    if (force) { F.dailyFailed.clear(); F.daily = {}; }
    // daily prices first (they drive the estimated values), then the weekly history for the risk maths
    const queue = FR.dailySymbols(F.holdings).filter((s) => !F.daily[s] && !F.dailyFailed.has(s)).map((s) => ["d", s])
      .concat(FR.symbolsNeeded(FR.aggregate(currentHoldings())).filter((s) => !F.hist[s] && !F.failed.has(s)).map((s) => ["w", s]));
    if (!queue.length) return;
    F.loading = true;
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [kind, s] = job;
        try {
          if (kind === "d") { const h = await Store.daily(s); if (h.length) F.daily[s] = h; else F.dailyFailed.add(s); }
          else { const h = await Store.history(s); if (h.length > 1) F.hist[s] = h; else F.failed.add(s); }
        } catch { (kind === "d" ? F.dailyFailed : F.failed).add(s); }
      }
    };
    await Promise.all([1, 2, 3, 4].map(worker));
    F.loading = false;
    if (S.tab === "fidelity" && $("#sheet").hidden) render();
  }

  /** The last position file moved to today's prices plus the weekly plan (null until there is something to estimate). */
  function currentEstimate() {
    if (!F.holdings || !F.holdings.accounts.some((a) => a.positions.length)) return null;
    return FR.estimate(F.holdings, F.daily, todayS());
  }
  /** Holdings the page is showing: the estimate, or the file as it was on its own date. */
  function currentHoldings() {
    const e = currentEstimate();
    if (!e) return F.holdings;
    return F.mode === "est" && e.changed ? e.holdings : e.base;
  }

  /** Everything the Fidelity page shows, calculated from the saved fund list and whatever prices are loaded. */
  function fidelityModel() {
    const est = currentEstimate();
    const h = est ? (F.mode === "est" && est.changed ? est.holdings : est.base) : F.holdings;
    if (!h || !h.accounts.some((a) => a.positions.length)) return null;
    const positions = FR.aggregate(h), total = FR.totalOf(positions), lt = FR.lookThrough(positions);
    const sectors = FR.bucketRisk(lt.buckets, F.hist);
    const risk = FR.fundRisk(positions, F.hist);
    const fundShares = risk ? risk.shares : FR.fundSharesFromBuckets(positions, sectors.rows);
    const top10 = lt.companies.slice(0, 10);
    return { h, est, isEst: !!est && F.mode === "est" && est.changed, positions, total, lt, sectors, risk, fundShares, top10, top10Share: top10.reduce((s, c) => s + c.value, 0) / (total || 1) };
  }

  function sectorChart(canvas, rows) {
    const money$ = css("--blue"), risk$ = css("--orange"), ink = css("--muted"), grid = css("--line");
    charts.push(new Chart(canvas, {
      type: "bar",
      data: { labels: rows.map((r) => BUCKET[r.id].name), datasets: [
        { label: "Share of money", data: rows.map((r) => r.weight * 100), backgroundColor: money$, borderRadius: 3, barPercentage: 0.9, categoryPercentage: 0.72 },
        { label: "Share of risk", data: rows.map((r) => r.share * 100), backgroundColor: risk$, borderRadius: 3, barPercentage: 0.9, categoryPercentage: 0.72 },
      ] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
        interaction: { mode: "index", axis: "y", intersect: false },
        plugins: { legend: { display: true, position: "top", align: "start", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: ink } },
          tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (it) => {
            const r = rows[it.dataIndex];
            return it.datasetIndex === 0 ? ` Share of money: ${it.parsed.x.toFixed(1)}%${S.hide ? "" : " (" + FE.money(r.value) + ")"}` : ` Share of risk: ${it.parsed.x.toFixed(1)}%`; } } } },
        scales: { x: { grid: { color: grid }, ticks: { color: ink, callback: (v) => v + "%" } },
          y: { grid: { display: false }, ticks: { color: css("--text"), font: { size: 13 } } } } },
    }));
  }

  /** One or two plain sentences about where the risk comes from. */
  function riskStory(m) {
    const rows = m.sectors.rows.filter((r) => r.id !== "cash").slice().sort((a, b) => b.share - a.share);
    if (!rows.length) return "";
    const top = rows[0], parts = [];
    parts.push(`The biggest source of risk is <b>${BUCKET[top.id].name}</b>: ${pct1(top.weight)} of the money, ${pct1(top.share)} of the risk.`);
    const eq = rows.filter((r) => BUCKET[r.id].group === "eq" && r.id !== top.id).sort((a, b) => b.weight - a.weight)[0];
    if (eq) parts.push(`Among stocks the largest sector is <b>${BUCKET[eq.id].name}</b> (${pct1(eq.weight)} of the money, ${pct1(eq.share)} of the risk).`);
    const calm = rows.filter((r) => r.weight > 0.05 && r.share < r.weight * 0.6).sort((a, b) => b.weight - a.weight)[0];
    if (calm) parts.push(`<b>${BUCKET[calm.id].name}</b> carries little risk for its size (${pct1(calm.weight)} of the money, ${pct1(calm.share)} of the risk).`);
    const cash = m.sectors.rows.find((r) => r.id === "cash");
    if (cash && cash.weight > 0.02) parts.push(`Cash (${pct1(cash.weight)}) carries none.`);
    return parts.join(" ");
  }

  function fidelityView() {
    const editBtn = `<button class="btn small" data-action="fid-edit">✎ Update holdings</button>`;
    if (F.error) return pageHead("Holdings", "", editBtn) + `<div class="card"><p class="muted">The holdings could not be read: ${esc(F.error)}</p></div>`;
    const m = fidelityModel();
    if (!m) return pageHead("Holdings", "No holdings yet", editBtn) + `<div class="card"><p class="muted">Import the positions file your broker exports (CSV) or add the funds by hand.</p>
      <div class="row"><button class="btn primary small" data-action="fid-import">⬇️ Import positions CSV</button>${editBtn}</div></div>`;
    const { h, est, isEst, positions, total, sectors, risk } = m;
    const l = latest(), recGap = l ? total - l.record.fidelity : null;
    const modeSeg = est && est.changed ? `<div class="seg mini"><button class="${isEst ? "on" : ""}" data-action="fid-mode" data-mode="est">Estimate</button><button class="${isEst ? "" : "on"}" data-action="fid-mode" data-mode="file">Last file</button></div>` : "";
    const headSub = isEst
      ? `<span class="pill plan">estimate</span> at ${FE.dateTR(est.priceDay)} prices · last positions file ${FE.dateTR(est.asof)} · ${positions.length} funds, ${h.accounts.length} accounts`
      : `Positions file ${h.asof ? FE.dateTR(h.asof) : "undated"} · ${positions.length} funds, ${h.accounts.length} accounts`;
    const sinceFile = isEst ? `${money(est.marketChange, { signed: true, colored: true })} since the file${est.buys.length ? ` · ${est.buys.length} weekly buys (${money(est.bought)}) moved from cash into funds` : ""}` : "";
    const w = F.watch;
    const watchLine = !w ? "" : w.state === "ok" ? `📥 Watching the Downloads folder${w.imported ? ` · last imported: ${esc(w.imported.file)}` : ""}.`
      : w.state === "starting" ? "" : `⚠️ ${esc(w.message)}`;
    const pricesNote = F.loading ? "Loading prices…" : risk ? `From the last ${risk.weeks} weeks of prices` : "No price data";
    const vol = risk ? risk.vol : sectors.vol, badPct = (1.645 * vol) / Math.sqrt(12);
    const approx = risk ? "" : ' <span class="pill plan">assumed</span>';
    const sectorRows = sectors.rows.slice().sort((a, b) => (a.id === "cash") - (b.id === "cash") || b.share - a.share);
    const classes = FD.CLASSES.map((c) => ({ ...c, value: m.lt.classes[c.id] || 0 })).filter((c) => c.value > 0);
    const fundRow = (p) => { const f = FD.fundOf(p.symbol), sh = m.fundShares[p.symbol], w = p.value / total;
      return `<tr class="row-link" data-action="fid-fund" data-symbol="${esc(p.symbol)}"><td><b>${esc(p.symbol)}</b> <span class="muted small fund-name">${esc(f.name)}</span></td>
        <td>${money(p.value)}</td><td class="muted">${pct1(w)}</td>
        <td class="${sh != null && sh > w * 1.5 && sh > 0.03 ? "neg bold" : ""}">${f.cash ? '<span class="faint">—</span>' : sh == null ? '<span class="faint">?</span>' : pct1(sh)}</td>
        <td class="muted only-desktop-cell">${risk && risk.vols[p.symbol] != null ? pct1(risk.vols[p.symbol]) : '<span class="faint">—</span>'}</td></tr>`; };
    const missing = risk ? risk.missing : [];
    return `${pageHead("Holdings", headSub, modeSeg + hideBtn() + editBtn)}
      <div class="grid">
        ${w && w.state !== "ok" && w.state !== "starting" ? `<div class="s12 banner" style="margin:0">${watchLine}</div>` : ""}
        ${kpi(isEst ? "Estimated total" : "Total of funds", money(total), [sinceFile, recGap != null ? `Latest brokerage entry ${money(l.record.fidelity)} (${FE.dateTR(l.date)})` : ""].filter(Boolean).join("<br>"), "s3 kpi-main")}
        ${kpi("Yearly volatility" + approx, vol ? pct1(vol) : "—", "In a normal year the value moves up or down by roughly this much", "s3")}
        ${kpi("Loss in a bad month" + approx, vol ? money(-badPct * total, { colored: true }) : "—", vol ? `${pct1(badPct)} · worse than this is expected about one month in twenty` : "", "s3")}
        ${kpi("Sensitivity to the S&P 500", risk && risk.beta != null ? risk.beta.toFixed(2) : "—", risk && risk.beta != null ? `If the S&P falls 10% the portfolio falls about ${pct1(risk.beta * 0.1)} · largest drop ${pct1(risk.maxDrawdown)}` : pricesNote, "s3")}

        <div class="card s8"><div class="card-head"><h2 class="card-title">Where the money is, and where the risk comes from</h2>
            <div class="row"><span class="tiny muted">${sectors.assumed ? (F.loading ? "Loading prices…" : "Long-run assumptions") : `Last ${sectors.weeks} weeks · sample prices`}</span><button class="icon-btn" data-action="fid-refresh" aria-label="Refresh prices">${F.loading ? "⏳" : "↻"}</button></div></div>
          <p class="small story">${riskStory(m)}</p>
          <div class="chart-box" style="height:${Math.max(sectorRows.length * 34 + 70, 220)}px"><canvas id="c-sectors"></canvas></div>
          <div class="tiny muted">Blue: the share of the money in that sector. Orange: how much of the portfolio's total swings comes from it. When orange is longer than blue, the sector carries more risk than its size.</div></div>

        <div class="card s4"><h2 class="card-title">Asset class</h2>
          <div class="donut-box"><canvas id="c-classes"></canvas><div class="donut-center"><div class="tiny muted">Total</div><b>${S.hide ? "••••••" : FE.short(total)}</b></div></div>
          <div class="legend">${classes.map((c) => `<div class="legend-row"><i class="swatch" style="background:${c.color}"></i><span class="grow">${c.name}</span><span class="muted small">${pct1(c.value / total)}</span><span class="amt">${money(c.value)}</span></div>`).join("")}</div></div>

        <div class="card s12"><div class="card-head"><h2 class="card-title">Funds</h2><span class="tiny muted">Click a fund to see what is inside and which account holds it</span></div>
          <div class="table-scroll"><table class="mini-table"><thead><tr><th>Fund</th><th>Amount</th><th>Share</th><th>Share of risk</th><th class="only-desktop-cell">Yearly volatility</th></tr></thead>
            <tbody>${positions.map(fundRow).join("")}</tbody>
            <tfoot><tr><td>Total</td><td>${money(total)}</td><td>100%</td><td></td><td class="only-desktop-cell"></td></tr></tfoot></table></div>
          ${missing.length ? `<div class="tiny muted">Left out of the risk figures because no price history was found: ${missing.map(esc).join(", ")}</div>` : ""}</div>

        <div class="card s6"><h2 class="card-title">Largest companies</h2>
          <div class="tiny muted" style="margin-top:4px">Looking inside the funds: how much of the money ends up in which companies.</div>
<div class="table-scroll"><table class="mini-table"><thead><tr><th>Company</th><th>Amount</th><th>Share</th></tr></thead><tbody>
            ${m.top10.map((c) => `<tr><td>${esc(c.name)} <span class="tiny faint">${c.funds.map(esc).join(", ")}</span></td><td>${money(c.value)}</td><td class="muted">${pct1(c.value / total)}</td></tr>`).join("")}
          </tbody><tfoot><tr><td>Top 10 companies</td><td>${money(m.top10Share * total)}</td><td>${pct1(m.top10Share)}</td></tr></tfoot></table></div>
          <div class="tiny muted">Only each fund's published largest positions are counted, so the real share may be slightly higher.</div></div>

        <div class="card s6"><h2 class="card-title">Accounts</h2>
          ${h.accounts.map((a) => { const t = a.positions.reduce((s, p) => s + p.value, 0);
            return `<div class="acct"><div class="line"><b class="name">${esc(a.name)}</b><span class="pct">${pct1(t / total)}</span><span class="amt bold">${money(t)}</span></div>
              ${a.positions.slice().sort((x, y) => y.value - x.value).map((p) => `<div class="line sub row-link" data-action="fid-fund" data-symbol="${esc(p.symbol)}"><span class="name">${esc(p.symbol)}</span><span class="pct">${pct1(p.value / (t || 1))}</span><span class="amt">${money(p.value)}</span></div>`).join("")}</div>`; }).join("")}</div>

        <div class="s12 note">${isEst ? `Estimate: the share counts in the last positions file × current prices${h.plan.buys.length ? `, plus a ${money(h.plan.buys.filter((b) => !b.from || b.from <= todayS()).reduce((s, b) => s + b.amount, 0))} plan buy every Wednesday` : ""}. Dividends, trades outside the plan and deposits are not seen; the next file replaces the estimate with real figures.<br>` : ""}Demo: fictional holdings and generated sample prices. The private app reads the broker's positions file from the Downloads folder by itself and uses live prices. Risk figures come from ${risk ? `the funds' last ${risk.weeks} weeks of price moves` : "long-run volatility assumptions"}. Sector risk is measured with US sector funds, which also stand in for non-US stocks, so it is an approximate picture. Fund contents as of ${FE.dateTR(FD.FUND_DATA_ASOF)}. Past volatility does not guarantee the future.</div>
      </div>`;
  }

  function openFund(symbol) {
    const m = fidelityModel(); if (!m) return;
    const p = m.positions.find((x) => x.symbol === symbol); if (!p) return;
    const f = FD.fundOf(symbol), w = p.value / m.total, sh = m.fundShares[symbol];
    const sec = Object.entries(FR.normWeights(f.sectors)).sort((a, b) => b[1] - a[1]);
    const tile = (t, v) => `<div class="tile"><div class="tiny">${t}</div><div class="bold">${v}</div></div>`;
    openSheet(`${bar(esc(symbol))}
      <div class="card"><b>${esc(f.name)}</b><div class="small muted" style="margin-top:4px">${esc(f.what)}</div></div>
      <div class="tiles">${tile("Amount", money(p.value))}${tile("Share of portfolio", pct1(w))}${tile("Share of risk", f.cash ? "—" : sh == null ? "?" : pct1(sh))}</div>
      <div class="section-title">Held in</div><div class="list">${p.accounts.map((a) => `<div class="kv"><span>${esc(a.name)}${a.shares != null && !S.hide ? ` <span class="tiny faint">${a.shares.toFixed(3)} shares</span>` : ""}</span><span>${money(a.value)}</span></div>`).join("")}</div>
      <div class="section-title">What is inside${f.approx ? " (approximate)" : ""}</div>
      <div class="card"><div class="stackbar" style="margin-top:0">${sec.map(([id, v]) => `<i style="width:${v * 100}%;background:${BUCKET[id].color}"></i>`).join("")}</div>
        ${sec.map(([id, v]) => `<div class="line"><i class="swatch" style="background:${BUCKET[id].color}"></i><span class="name">${BUCKET[id].name}</span><span class="pct">${pct1(v)}</span><span class="amt">${money(p.value * v)}</span></div>`).join("")}</div>
      ${f.top.length ? `<div class="section-title">Largest companies</div><div class="list">${f.top.map(([n, pc]) => `<div class="kv"><span>${esc(n)} <span class="tiny faint">${pc}% of the fund</span></span><span>${money((p.value * pc) / 100)}</span></div>`).join("")}</div>` : ""}
      ${f.fee != null ? `<div class="note">Yearly expense ratio ${f.fee}% (about ${S.hide ? "••" : FE.money((p.value * f.fee) / 100)} a year on this amount).</div>` : ""}`);
  }

  /** Editor for the fund list: amounts per account, add/remove rows, or load Fidelity's positions CSV. */
  function openFidEdit(draft = null, imported = false) {
    const d = draft || FR.normalizeHoldings(JSON.parse(JSON.stringify(F.holdings || { accounts: [] })));
    if (!d.accounts.length) d.accounts.push({ id: "h1", name: "Brokerage", positions: [] });
    if (!d.asof) d.asof = todayS();
    const reopen = () => openFidEdit(d, imported);
    const sum = () => d.accounts.reduce((s, a) => s + a.positions.reduce((t, p) => t + (p.value || 0), 0), 0);
    if (!d.plan) d.plan = { weekday: 3, buys: [] };
    const planSum = () => d.plan.buys.reduce((s, b) => s + (b.amount || 0), 0);
    openSheet(`${bar("Holdings")}
      ${imported ? '<div class="banner">The positions read from the file are below. Check them and press <b>Save</b>; they replace the current list.</div>' : ""}
      <div class="list"><div class="field"><label>File date</label><input type="date" data-fid="asof" value="${esc(d.asof)}"></div></div>
      ${d.accounts.map((a, i) => `<div class="section-title">Account</div>
        <div class="list"><div class="field"><input class="grow" style="text-align:left;width:auto;font-weight:700" data-fid="name:${i}" value="${esc(a.name)}" placeholder="Account name">
            <button class="icon-btn" data-action="fid-acc-del" data-i="${i}" aria-label="Delete account">✕</button></div>
          ${a.positions.map((p, j) => `<div class="field"><input style="text-align:left;width:34%;text-transform:uppercase;font-weight:650" data-fid="sym:${i}:${j}" value="${esc(p.symbol)}" placeholder="Symbol">
            <span class="grow tiny muted ellipsis">${esc(FD.FUNDS[p.symbol] ? FD.FUNDS[p.symbol].name : "")}</span>
            <input inputmode="decimal" style="width:28%" data-fid="val:${i}:${j}" value="${esc(fmtInput(p.value))}" placeholder="0">
            <button class="icon-btn" data-action="fid-pos-del" data-i="${i}" data-j="${j}" aria-label="Delete">✕</button></div>`).join("")}
          <div class="field"><button class="link small" data-action="fid-pos-add" data-i="${i}">＋ Add fund</button></div></div>`).join("")}
      <div class="row" style="margin-top:12px"><button class="btn small" data-action="fid-acc-add">＋ Add account</button><button class="btn small" data-action="fid-import">⬇️ Import positions CSV</button></div>
      <div class="note">CSV: the positions file a broker exports (the private app reads Fidelity's). Account numbers are not kept, only the account name, symbol, share count and amount. Editing an amount by hand drops that fund's share count.</div>
      <div class="section-title">Weekly plan (every Wednesday) · <span id="fid-plan-sum">${FE.money(planSum())}</span></div>
      <div class="list">${d.plan.buys.map((b, i) => `<div class="field"><input style="text-align:left;width:26%;text-transform:uppercase;font-weight:650" data-fid="psym:${i}" value="${esc(b.symbol)}" placeholder="Symbol">
          <input inputmode="decimal" style="width:22%" data-fid="pamt:${i}" value="${esc(fmtInput(b.amount))}" placeholder="$">
          <span class="grow tiny muted right">starts</span><input type="date" data-fid="pfrom:${i}" value="${esc(b.from || "")}">
          <button class="icon-btn" data-action="fid-plan-del" data-i="${i}" aria-label="Delete">✕</button></div>`).join("")}
        <div class="field"><button class="link small" data-action="fid-plan-add">＋ Add fund to plan</button></div></div>
      <div class="note">The estimate between two files uses this plan: every Wednesday these amounts leave the cash of the account holding the most cash and go into the funds. A line with no start date applies right away.</div>
      <div class="bottom-bar"><div class="inner col-bar"><div class="sum"><div class="sum-wide"><span class="tiny muted">Total</span> <b class="num" id="fid-sum">${FE.money(sum())}</b></div></div>
        <div class="row"><button class="btn" data-action="close">Cancel</button><button class="btn primary grow" data-action="fid-save">Save</button></div></div></div>`,
    {
      "fid-pos-add": (el) => { d.accounts[+el.dataset.i].positions.push({ symbol: "", value: 0 }); reopen(); },
      "fid-pos-del": (el) => { d.accounts[+el.dataset.i].positions.splice(+el.dataset.j, 1); reopen(); },
      "fid-plan-add": () => { d.plan.buys.push({ symbol: "", amount: 0 }); reopen(); },
      "fid-plan-del": (el) => { d.plan.buys.splice(+el.dataset.i, 1); reopen(); },
      "fid-acc-add": () => { d.accounts.push({ id: "h" + (d.accounts.length + 1), name: "New account", positions: [] }); reopen(); },
      "fid-acc-del": (el) => { const a = d.accounts[+el.dataset.i]; if (a.positions.length && !confirm(`Delete ${a.name} and its ${a.positions.length} funds?`)) return; d.accounts.splice(+el.dataset.i, 1); reopen(); },
      "fid-save": async () => {
        const clean = FR.normalizeHoldings(d);
        clean.accounts = clean.accounts.filter((a) => a.positions.length);
        if (imported || !clean.source) clean.source = imported ? "Positions file (CSV)" : "Entered by hand";
        if (imported) clean.note = "";
        toast("Saving…", 20000);
        try { F.rev = await Store.saveHoldings(clean); } catch (e) { return toast("Could not save: " + e.message, 5000); }
        F.holdings = clean; F.error = null; toast("Saved"); closeSheet(); render();
      },
    },
    (el) => {
      el.addEventListener("input", (e) => {
        const k = e.target.dataset.fid; if (!k) return;
        const [kind, i, j] = k.split(":");
        if (kind === "asof") { if (FE.parseDay(e.target.value)) d.asof = e.target.value; }
        else if (kind === "name") d.accounts[+i].name = e.target.value;
        else if (kind === "sym") { const p = d.accounts[+i].positions[+j]; p.symbol = e.target.value.trim().toUpperCase(); delete p.shares; }
        else if (kind === "val") { const p = d.accounts[+i].positions[+j]; p.value = parseAmount(e.target.value) ?? 0; delete p.shares; $("#fid-sum", el).textContent = FE.money(sum()); }
        else if (kind === "psym") d.plan.buys[+i].symbol = e.target.value.trim().toUpperCase();
        else if (kind === "pamt") { d.plan.buys[+i].amount = parseAmount(e.target.value) ?? 0; $("#fid-plan-sum", el).textContent = FE.money(planSum()); }
        else if (kind === "pfrom") { if (FE.parseDay(e.target.value)) d.plan.buys[+i].from = e.target.value; else delete d.plan.buys[+i].from; }
      });
    });
  }

  // ───────────────────────── render ─────────────────────────
  function render() {
    destroyCharts();
    document.querySelectorAll(".tab, .side-link").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === S.tab));
    renderSideFoot();
    const views = { overview: overviewView, accounts: accountsView, fidelity: fidelityView, records: recordsView, analysis: analysisView, settings: settingsView };
    $("#view").innerHTML = views[S.tab]();
    if (!window.Chart) return;
    const l = latest();
    if (S.tab === "overview" && l) {
      lineChart($("#c-total"), accounts()[0]);
      donutChart($("#c-donut"), groupsOf(l));
      barChart($("#c-flow"), actualRows().filter((r) => r.change != null && r.date > FE.addMonths(l.date, -12)), (r) => r.change, "Growth");
      loadQuotes();
    }
    if (S.tab === "accounts" && l) {
      const accs = accounts(), acc = accs.find((a) => a.id === S.account) || accs[0];
      lineChart($("#c-acc"), acc, { plan: ["total", "fidelity", "banks"].includes(acc.id) || acc.id.startsWith("bank:") });
    }
    if (S.tab === "fidelity") {
      const m = fidelityModel();
      if (m && $("#c-sectors")) {
        sectorChart($("#c-sectors"), m.sectors.rows.slice().sort((a, b) => (a.id === "cash") - (b.id === "cash") || b.share - a.share));
        donutChart($("#c-classes"), FD.CLASSES.map((c) => ({ name: c.name, color: c.color, value: m.lt.classes[c.id] || 0 })).filter((c) => c.value > 0));
      }
      ensureHistories();
    }
    if (S.tab === "analysis") {
      barChart($("#c-net"), actualRows().filter((r) => r.change != null && inRange(r)), (r) => r.change, "Growth");
      allocationChart($("#c-alloc"));
    }
  }
  function renderSideFoot() {
    const el = $("#side-foot"); if (!el) return;
    const l = latest(), sync = Store.state.sync;
    el.innerHTML = `${l ? `Latest entry<br><b style="color:var(--text)">${FE.dateTR(l.date)}</b><br>` : ""}${S.records.length} entries · stored in this browser`;
  }

  // ───────────────────────── dialogs ─────────────────────────
  let sheetActions = {};
  function openSheet(html, actions = {}, onMount) {
    const el = $("#sheet");
    el.innerHTML = `<div class="sheet-inner">${html}</div>`;
    el.hidden = false; el.scrollTop = 0; document.body.style.overflow = "hidden";
    sheetActions = actions;
    onMount && onMount(el);
  }
  function closeSheet() { const el = $("#sheet"); el.hidden = true; el.innerHTML = ""; document.body.style.overflow = ""; sheetActions = {}; }
  const bar = (title) => `<div class="sheet-bar"><button class="close" data-action="close" aria-label="Close">✕</button><h3>${title}</h3><span style="width:38px"></span></div>`;

  function openDetail(date) {
    const r = S.rows.find((x) => x.date === date);
    if (!r) return;
    const rec = r.record, p = FE.previousOf(S.rows, r), kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
    const banks = FE.orderedKeys(S.banks.map((b) => b.key), [rec]).filter((k) => rec.banks[k] != null);
    const pos = banks.reduce((s, k) => s + Math.max(rec.banks[k], 0), 0) || 1;
    openSheet(`${bar(FE.dateTR(date) + (r.isPlan ? " · Plan" : ""))}
      <div class="tiles">${[["Total", money(r.total)], ["Change", money(r.change, { signed: true, colored: true })], ["Since previous", r.days != null ? r.days + " days" : "—"]]
        .map(([t, v]) => `<div class="tile"><div class="tiny">${t}</div><div class="bold">${v}</div></div>`).join("")}</div>
      <div class="section-title">Calculated</div><div class="list">${kv("Digital total", money(r.digital))}${kv("Digital change", money(r.digitalChange, { signed: true, colored: true }))}${kv("Avg. growth per 30 days", money(r.avg30, { signed: true, colored: true }))}</div>
      <div class="section-title">Balances</div><div class="list">${kv("Brokerage", money(rec.fidelity))}${kv("Banks", money(bankTotal(rec)))}${["borc", "cash", "fidelity_transfer_in"].map((f) => kv(FE.LABELS[f], money(rec[f]))).join("")}</div>
      ${FE.hasBreakdown(rec) && banks.length ? `<div class="section-title">Banks</div><div class="card"><div class="stackbar" style="margin-top:0">${banks.filter((k) => rec.banks[k] > 0).map((k) => `<i style="width:${(rec.banks[k] / pos) * 100}%;background:${bankColor(k)}"></i>`).join("")}</div>
        ${banks.map((k) => `<div class="line"><i class="swatch" style="background:${bankColor(k)}"></i><span class="name">${esc(bankName(k))}</span><span class="amt">${money(rec.banks[k])}</span></div>`).join("")}</div>` : ""}
      ${rec.legacy_1yil != null || rec.legacy_oran != null ? `<div class="section-title">Sheet metrics</div><div class="list">${kv("1 Year", rec.legacy_1yil == null ? "—" : FE.pct(rec.legacy_1yil))}${kv("Ratio", rec.legacy_oran == null ? "—" : FE.pct(rec.legacy_oran))}</div>` : ""}
      ${rec.note ? `<div class="section-title">Note</div><div class="card">${esc(rec.note)}</div>` : ""}
      <div class="bottom-bar"><div class="inner"><button class="btn danger" data-action="delete">Delete</button><button class="btn primary grow" data-action="edit">Edit</button></div></div>`,
    {
      edit: () => openRecordForm(date),
      delete: async () => {
        if (!confirm(`Delete the ${FE.dateTR(date)} entry?`)) return;
        if (await commit(S.records.filter((x) => x.date !== date), S.banks, `Entry deleted: ${date}`)) { closeSheet(); render(); }
      },
    });
  }

  /** One form for new and existing records: every account on one screen, previous values as hints, live totals. */
  function openRecordForm(date = null) {
    const orig = date ? S.records.find((x) => x.date === date) : null;
    const base = (() => {
      if (orig) { const row = S.rows.find((x) => x.date === date); const p = row && FE.previousOf(S.rows, row); return p ? p.record : null; }
      return S.records.filter((r) => r.status === "actual").sort((a, b) => (a.date < b.date ? -1 : 1)).pop() || null;
    })();
    let d;
    if (orig) d = FE.clone(orig);
    else {
      d = FE.emptyRecord(FE.suggestedDate(base && base.date, todayS()));
      if (base) {
        Object.assign(d, { fidelity: base.fidelity, saving: base.saving, checking: base.checking, borc: base.borc, cash: base.cash });
        for (const b of S.banks) if (!b.hidden && base.banks[b.key] != null) d.banks[b.key] = base.banks[b.key];
      }
    }
    const bankKeys = FE.orderedKeys(S.banks.filter((b) => !b.hidden || d.banks[b.key] != null).map((b) => b.key), [d]);
    const prevOf = (path) => (!base ? null : path === "banksTotal" ? bankTotal(base) : path.startsWith("bank:") ? base.banks[path.slice(5)] ?? null : base[path] ?? null);
    const valueOf = (path) => (path === "banksTotal" ? bankTotal(d) : path.startsWith("bank:") ? d.banks[path.slice(5)] ?? null : d[path] ?? null);
    const hint = (path) => { const p = prevOf(path); return p == null ? "" : `previous ${FE.money(p)}`; };
    const field = (label, path, color) => `<label class="ff"><span class="ff-label">${color ? `<i class="swatch" style="background:${color}"></i>` : ""}${esc(label)}</span>
      <input inputmode="decimal" autocomplete="off" data-field="${path}" value="${esc(fmtInput(valueOf(path)))}" placeholder="0"><span class="ff-hint" data-hint="${path}">${hint(path)}</span></label>`;
    const stale = () => orig ? [] : S.records.filter((r) => r.status === "plan" && r.date < d.date && (!base || r.date > base.date));
    const finalRecord = () => { const r = FE.applyBreakdownRule(FE.clone(d), kinds()); if (!orig) r.status = "actual"; return r; };
    const summary = () => {
      const r = finalRecord(), st = new Set(stale().map((x) => x.date));
      const others = S.records.filter((x) => x.date !== r.date && x.date !== date && !st.has(x.date));
      const rows = withChanges(FE.compute(others.concat([r]))), row = rows.find((x) => x.date === r.date);
      const avg = row && !row.isPlan ? last12(rows, row.date) : null;
      const derived = FE.hasBreakdown(r) ? `<div class="tiny muted">Banks ${FE.money(bankTotal(r))}</div>` : "";
      return `<div class="sum"><div><div class="tiny muted">Total</div><b class="num">${row ? FE.money(row.total) : "—"}</b>${derived}</div>
        <div><div class="tiny muted">Change</div><b class="num ${tone(row && base ? row.total - FE.total(base) : null)}">${row && base ? FE.money(row.total - FE.total(base), true) : "—"}</b></div>
        <div><div class="tiny muted">Avg. monthly growth · 12 months</div><b class="num ${tone(avg && avg.monthly)}">${avg ? FE.money(avg.monthly, true) : "—"}</b></div></div>`;
    };
    const breakdown = FE.hasBreakdown(d) || (!orig && bankKeys.length > 0);
    openSheet(`${bar(orig ? "Edit entry" : "New entry")}
      <div class="form-top"><label class="ff"><span class="ff-label">Date</span><input type="date" data-field="date" value="${d.date}"></label>
        ${orig ? `<label class="ff"><span class="ff-label">Status</span><select data-field="status"><option value="actual" ${d.status === "actual" ? "selected" : ""}>Actual</option><option value="plan" ${d.status === "plan" ? "selected" : ""}>Plan</option></select></label>` : ""}</div>
      <div class="section-title">Investments</div><div class="ff-grid">${field("Brokerage", "fidelity", GROUP.fidelity)}${field("Transferred in (this period)", "fidelity_transfer_in")}</div>
      <div class="note">Optional: if you added new money to the brokerage account this period, enter it here (so its return can be separated later).</div>
      <div class="section-title">Banks</div><div class="ff-grid">${breakdown
        ? bankKeys.map((key) => field(bankName(key), "bank:" + key, bankColor(key))).join("") || '<div class="muted small">No banks. Add one in Settings → Banks.</div>'
        : field("Banks (total)", "banksTotal", GROUP.banks)}</div>
      <div class="section-title">Other</div><div class="ff-grid">${field("Receivables (money owed to you)", "borc", GROUP.borc)}${field("Cash", "cash", GROUP.cash)}</div>
      <div class="section-title">Note</div><textarea class="input" rows="2" data-field="note" placeholder="Optional">${esc(d.note)}</textarea>
      <div class="note" id="stale-note">${stale().length ? `${stale().length} past plan ${stale().length === 1 ? "entry" : "entries"} (${stale().map((x) => FE.dateTR(x.date)).join(", ")}) will be removed.` : ""}</div>
      <div class="bottom-bar"><div class="inner col-bar"><div id="form-sum">${summary()}</div><div class="row"><button class="btn" data-action="close">Cancel</button><button class="btn primary grow" data-action="save-record">Save</button></div></div></div>`,
    {
      "save-record": async () => {
        const rec = finalRecord();
        if (!FE.parseDay(rec.date)) return toast("Invalid date");
        const clash = S.records.find((x) => x.date === rec.date && x.date !== date);
        if (clash && (orig || clash.status === "actual")) return toast(`There is already an entry on ${FE.dateTR(rec.date)}.`, 4000);
        const st = new Set(stale().map((x) => x.date));
        let next = S.records.filter((x) => x.date !== date && x.date !== rec.date && !st.has(x.date)).concat([rec]);
        const ps = planSettings(), hadPlan = S.records.some((x) => x.status === "plan");
        if (ps.auto && hadPlan && rec.status === "actual" && latestActualRecord(next) === rec) next = replanned(next, ps);
        if (await commit(next, S.banks, orig ? `Entry edited: ${rec.date}` : `Entry: ${rec.date}`)) { closeSheet(); render(); }
      },
    },
    (el) => {
      const first = $('[data-field="fidelity"]', el); if (first && !orig) setTimeout(() => { first.focus(); first.select(); }, 60);
      el.addEventListener("input", (e) => {
        const f = e.target.dataset.field; if (!f) return;
        const v = e.target.value;
        if (f === "date") { if (FE.parseDay(v)) d.date = v; $("#stale-note", el).textContent = stale().length ? `${stale().length} past plan ${stale().length === 1 ? "entry" : "entries"} (${stale().map((x) => FE.dateTR(x.date)).join(", ")}) will be removed.` : ""; }
        else if (f === "status") d.status = v; else if (f === "note") d.note = v;
        else if (f.startsWith("bank:")) { const n = parseAmount(v); if (n == null) delete d.banks[f.slice(5)]; else d.banks[f.slice(5)] = n; }
        else if (f === "banksTotal") { d.saving = parseAmount(v) ?? 0; d.checking = 0; }
        else if (f === "fidelity") d[f] = parseAmount(v) ?? 0;
        else d[f] = parseAmount(v);
        if (f !== "note" && f !== "date" && f !== "status") {
          const h = $(`[data-hint="${f}"]`, el), p = prevOf(f), cur = valueOf(f);
          if (h && p != null) { const ch = (cur ?? 0) - p; h.innerHTML = `previous ${FE.money(p)}${Math.round(ch) ? ` · <span class="${tone(ch)}">${FE.money(ch, true)}</span>` : ""}`; }
        }
        $("#form-sum", el).innerHTML = summary();
      });
      el.addEventListener("focusout", (e) => { const f = e.target.dataset && e.target.dataset.field; if (f && f !== "date" && f !== "note" && f !== "status") e.target.value = fmtInput(valueOf(f)); });
    });
  }

  // ───────────────────────── import / export / plan ─────────────────────────
  function openImport(parsed, name) {
    const plan = FE.importPlan(parsed, S.records);
    const known = new Set(S.banks.map((b) => b.key)), newBanks = parsed.bankKeys.filter((k) => !known.has(k));
    const has = plan.newRecords.length || plan.changed.length;
    const kv = (k, v, c = "") => `<div class="kv"><span>${k}</span><span class="bold ${c}">${v}</span></div>`;
    const label = (c) => FE.LABELS[c] || bankName(c);
    openSheet(`${bar("Import preview")}<div class="section-title">${esc(name)}</div>
      <div class="list">${kv("New", plan.newRecords.length, "pos")}${kv("Changed", plan.changed.length, plan.changed.length ? "" : "muted")}${kv("Unchanged", plan.unchanged.length, "muted")}${kv("Rejected", plan.rejected.length, plan.rejected.length ? "neg" : "muted")}</div>
      <div class="note">No entry is deleted. Only new and changed rows are written.</div>
      ${newBanks.length ? `<div class="section-title">New bank columns</div><div class="list">${newBanks.map((k) => kv(FE.defaultName(k), k, "muted")).join("")}</div><div class="note">They are added as banks when you apply.</div>` : ""}
      ${plan.changed.length ? `<div class="section-title">Changed</div><div class="list">${plan.changed.map((c) => `<details class="kv" style="display:block"><summary>${FE.dateTR(c.record.date)} <span class="muted small">· ${c.changes.length} ${c.changes.length === 1 ? "field" : "fields"}</span></summary>
        ${c.changes.map((ch) => `<div class="small" style="padding:4px 0"><span class="muted">${esc(label(ch.key))}:</span> <span class="neg">${esc(ch.before || "—")}</span> → <span class="pos">${esc(ch.after || "—")}</span></div>`).join("")}</details>`).join("")}</div>` : ""}
      ${plan.rejected.length ? `<div class="section-title">Rejected rows</div><div class="list">${plan.rejected.map((r) => `<div class="kv" style="display:block"><div class="small">Row ${r.line}${r.dateText ? " · " + esc(r.dateText) : ""}</div><div class="tiny neg">${esc(r.reason)}</div></div>`).join("")}</div>` : ""}
      <div class="bottom-bar"><div class="inner"><button class="btn" data-action="close">Cancel</button><button class="btn grow primary" data-action="apply-import" ${has ? "" : "disabled"}>Apply</button></div></div>`,
    {
      "apply-import": async () => {
        const by = new Map(S.records.map((r) => [r.date, r]));
        for (const r of plan.newRecords.concat(plan.changed.map((c) => c.record))) by.set(r.date, r);
        const banks = S.banks.concat(newBanks.map((k) => ({ key: k, name: FE.defaultName(k), kind: FE.defaultKind(k), hidden: false })));
        if (await commit([...by.values()], banks, `Import: ${plan.newRecords.length} new, ${plan.changed.length} changed`, { banksChanged: newBanks.length > 0 })) { closeSheet(); render(); }
      },
    });
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ───────────────────────── Plan ─────────────────────────
  const HORIZONS = [[6, "6 months"], [12, "1 year"], [24, "2 years"], [36, "3 years"], [60, "5 years"], [120, "10 years"]];
  /**
   * Plan settings (kept in this browser). `horizon` (months) rolls forward with each new record;
   * `end` is used instead when a fixed date was picked. `transfer`/`savings` are only set when the
   * user overrode the model's numbers.
   */
  function planSettings() {
    let saved = {};
    try { saved = JSON.parse(ls.get("plan.settings") || "{}") || {}; } catch { /* corrupt: defaults */ }
    if (!saved.horizon && !saved.end && ls.get("plan.end")) saved.end = ls.get("plan.end");
    return { horizon: null, end: null, freq: ls.get("plan.freq") || "semimonthly", months: +ls.get("plan.months") || 24,
      rate: ls.get("plan.rate") != null ? +ls.get("plan.rate") : 7, transfer: null, savings: null, auto: true, ...saved };
  }
  const savePlanSettings = (p) => ls.set("plan.settings", JSON.stringify(p));
  const latestActualRecord = (records) => records.filter((r) => r.status === "actual").sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  const planEnd = (p, base) => (p.horizon ? FE.endOfMonth(FE.year(FE.addMonths(base.date, p.horizon)), +FE.addMonths(base.date, p.horizon).slice(5, 7)) : p.end || FE.addMonths(base.date, 12));
  /** Model + plan rows for `records` with settings `p`. */
  function buildPlan(records, p) {
    const base = latestActualRecord(records);
    if (!base) return null;
    const model = FE.trendModel(records, p.months, p.rate / 100);
    const transfer = p.transfer ?? (model ? model.contribution : 0), savings = p.savings ?? (model ? model.bankMonthly : 0);
    const end = planEnd(p, base);
    const rows = FE.generatePlan(base, end, p.freq, { annualReturn: p.rate / 100, monthlyTransfer: transfer, monthlySavings: savings });
    return { base, model, transfer, savings, end, rows };
  }
  /** Records with every plan after the latest actual replaced by a freshly generated plan. */
  function replanned(records, p) {
    const b = buildPlan(records, p);
    if (!b) return records;
    return records.filter((r) => !(r.status === "plan" && r.date > b.base.date)).concat(b.rows);
  }
  const planLabel = (p) => (p.horizon ? `${HORIZONS.find(([m]) => m === p.horizon)?.[1] || p.horizon + " months"} ahead` : p.end ? "ends " + FE.dateTR(p.end) : "");

  function openPlan() {
    if (!latestActualRecord(S.records)) return toast("A plan needs at least one actual entry.");
    const p = planSettings();
    let b = buildPlan(S.records, p);
    const existing = () => S.records.filter((r) => r.status === "plan" && r.date > b.base.date);
    const modelHTML = () => { const model = b.model; return !model ? '<div class="muted small">Not enough entries for the model.</div>' : `
      <div class="kv"><span>Total · monthly trend</span><span><b class="${tone(model.total.monthly)}">${FE.money(model.total.monthly, true)}</b> <span class="tiny muted">fit R² ${model.total.r2.toFixed(2)}</span></span></div>
      <div class="kv"><span>Brokerage · monthly trend</span><span>${FE.money(model.fidelity.monthly, true)} <span class="tiny muted">R² ${model.fidelity.r2.toFixed(2)}</span></span></div>
      <div class="kv"><span>Banks + receivables + cash · monthly trend</span><span>${FE.money(model.rest.monthly, true)}</span></div>
      <div class="kv"><span>Entries used</span><span class="small">${model.count} entries · ${FE.dateTR(model.from)} – ${FE.dateTR(model.to)}</span></div>`; };
    const previewHTML = () => {
      const g = b.rows, last = g[g.length - 1], base = b.base;
      const at = (n) => { const d = FE.addMonths(base.date, n), r = g.filter((x) => x.date <= d).pop(); return r && d <= last.date ? FE.money(FE.total(r)) : null; };
      const marks = last ? [[12, "In 1 year"], [36, "In 3 years"], [60, "In 5 years"]].map(([n, t]) => [t, at(n)]).filter(([, v]) => v) : [];
      return `<div class="kv"><span>Plan entries to create</span><span class="bold">${g.length}</span></div><div class="kv"><span>Old plan entries to remove</span><span>${existing().length}</span></div>
        ${last ? `<div class="kv"><span>Range</span><span class="small">${FE.dateTR(g[0].date)} – ${FE.dateTR(last.date)}</span></div>
        ${marks.map(([t, v]) => `<div class="kv"><span>${t}</span><span>${v}</span></div>`).join("")}
        <div class="kv"><span>Total at the last entry</span><span class="bold">${FE.money(FE.total(last))}</span></div><div class="kv"><span>Growth</span><span class="${tone(FE.total(last) - FE.total(base))}">${FE.money(FE.total(last) - FE.total(base), true)}</span></div>` : ""}`;
    };
    const horizonHTML = () => `<div class="seg wrap">${HORIZONS.map(([m, t]) => `<button class="${p.horizon === m ? "on" : ""}" data-action="plan-horizon" data-m="${m}">${t}</button>`).join("")}</div>`;
    const refresh = (el) => {
      b = buildPlan(S.records, p);
      $("#plan-model", el).innerHTML = modelHTML(); $("#plan-preview", el).innerHTML = previewHTML(); $("#plan-horizon", el).innerHTML = horizonHTML();
      const endIn = $('[data-p="end"]', el); if (document.activeElement !== endIn) endIn.value = b.end;
      for (const k of ["transfer", "savings"]) { const i = $(`[data-p="${k}"]`, el); if (document.activeElement !== i) i.value = b[k]; }
    };
    const f = (label, key, val, type = "text") => `<div class="field"><label>${label}</label><input ${type === "date" ? 'type="date"' : 'inputmode="decimal"'} data-p="${key}" value="${esc(val)}"></div>`;
    const sel = (label, key, opts) => `<div class="field"><label>${label}</label><select data-p="${key}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(p[key]) ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
    openSheet(`${bar("Plan")}
      <div class="section-title">How far ahead?</div><div id="plan-horizon">${horizonHTML()}</div>
      <div class="list" style="margin-top:8px"><div class="kv"><span>Start (latest actual entry)</span><span>${FE.dateTR(b.base.date)}</span></div>${f("End date", "end", b.end, "date")}
        ${sel("Frequency", "freq", FE.FREQUENCIES.map((x) => [x.id, x.label]))}</div>
      <div class="note">Pick a length (e.g. 1 year) and the plan rolls forward with each new entry. Enter a date and it ends on that date.</div>
      <div class="section-title">Learned from history</div><div class="list">${sel("Data window", "months", [[12, "Last 12 months"], [24, "Last 24 months"], [36, "Last 36 months"]])}<div id="plan-model">${modelHTML()}</div></div>
      <div class="section-title">Assumptions</div><div class="list">${f("Expected annual brokerage return (%)", "rate", p.rate)}${f("Monthly contribution to brokerage ($)", "transfer", b.transfer)}${f("Monthly added to banks ($)", "savings", b.savings)}
        <div class="field"><label>Calculate from data</label><button class="btn small" data-action="plan-reset">Reset</button></div></div>
      <div class="note">Model: a straight-line trend is fitted to past growth. The brokerage trend is split into "your contributions + return", so the model reproduces the past, while future returns grow as the account grows (compounding). Set the return to 0 for a straight trend. Contributions and bank savings are calculated from the data; if you change them, your numbers are used. Receivables and cash stay flat.</div>
      <div class="list" style="margin-top:12px"><div class="field"><label>Refresh the plan automatically after each new entry</label><label class="switch"><input type="checkbox" data-p="auto" ${p.auto ? "checked" : ""}><i></i></label></div></div>
      <div class="section-title">Preview</div><div class="list" id="plan-preview">${previewHTML()}</div>
      <div class="note">Actual entries are never touched; only plan entries after ${FE.dateTR(b.base.date)} change.</div>
      <div class="bottom-bar"><div class="inner"><button class="btn danger" data-action="plan-clear">Delete plans</button><button class="btn primary grow" data-action="plan-apply">Apply plan</button></div></div>`,
    {
      "plan-horizon": (btn) => { p.horizon = +btn.dataset.m; p.end = null; refresh($("#sheet")); },
      "plan-reset": () => { p.transfer = null; p.savings = null; refresh($("#sheet")); },
      "plan-apply": async () => {
        if (!b.rows.length) return toast("These settings produce no plan entries.");
        if (!confirm(`Replace ${existing().length} old plan entries with ${b.rows.length} new ones?`)) return;
        savePlanSettings(p);
        if (await commit(replanned(S.records, p), S.banks, `Plan updated: ${b.rows.length} entries (${planLabel(p)})`)) { closeSheet(); render(); }
      },
      "plan-clear": async () => {
        if (!confirm(`Delete ${existing().length} future plan entries?`)) return;
        p.auto = false; savePlanSettings(p);
        if (await commit(S.records.filter((r) => !(r.status === "plan" && r.date > b.base.date)), S.banks, "Future plans deleted")) { closeSheet(); render(); }
      },
    },
    (el) => {
      const onInput = (e) => {
        const k = e.target.dataset.p; if (!k) return;
        const v = e.target.value;
        if (k === "auto") p.auto = e.target.checked;
        else if (k === "end") { if (!FE.parseDay(v)) return; p.end = v; p.horizon = null; }
        else if (k === "freq") p.freq = v;
        else if (k === "transfer" || k === "savings") p[k] = v.trim() === "" ? null : parseAmount(v) ?? 0;
        else p[k] = parseAmount(v) ?? 0;
        refresh(el);
      };
      el.addEventListener("input", onInput);
      el.addEventListener("change", (e) => { if (e.target.dataset.p === "auto") onInput(e); });
    });
  }

  // ───────────────────────── actions ─────────────────────────
  const banksCopy = () => S.banks.map((b) => ({ ...b }));
  async function saveBanks(banks, msg, records = S.records) { if (await commit(records, banks, msg, { banksChanged: true })) render(); }
  const go = (tab) => { S.tab = tab; ls.set("tab", tab); window.scrollTo(0, 0); render(); };

  const A = {
    tab: (el) => go(el.dataset.tab),
    hide: () => { S.hide = !S.hide; ls.set("hide", S.hide ? "1" : "0"); render(); },
    new: () => openRecordForm(null),
    quotes: () => loadQuotes(true),
    range: (el) => { S.range = el.dataset.range; ls.set("range", S.range); render(); },
    account: (el) => { S.account = el.dataset.id; ls.set("account", S.account); if (S.tab !== "accounts") go("accounts"); else render(); },
    detail: (el) => openDetail(el.dataset.date),
    close: () => closeSheet(),
    reload: () => boot(),
    "reset-demo": async () => {
      if (!confirm("Restore the sample data? Your changes in this demo will be discarded.")) return;
      try { localStorage.removeItem("finans-demo.plan.settings"); } catch { /* ignore */ }
      await Store.reset(); await boot(); toast("Sample data restored");
    },
    import: () => $("#file").click(),
    export: (el) => {
      const keys = S.banks.map((b) => b.key), fmt = el.dataset.fmt;
      download(`finance_demo_${todayS()}.${fmt}`, fmt === "csv" ? FE.exportCSV(S.records, keys) : FE.exportJSON(S.records, keys), fmt === "csv" ? "text/csv" : "application/json");
    },
    plan: () => openPlan(),
    "fid-edit": () => openFidEdit(),
    "fid-fund": (el) => openFund(el.dataset.symbol),
    "fid-import": () => $("#file-positions").click(),
    "fid-refresh": () => { ensureHistories(true); render(); },
    "fid-mode": (el) => { F.mode = el.dataset.mode; ls.set("fid.mode", F.mode); render(); },
    "bank-rename": (el) => {
      const b = S.banks.find((x) => x.key === el.dataset.key), name = prompt("Bank name", b.name);
      if (!name || !name.trim() || name.trim() === b.name) return;
      const banks = banksCopy(); banks.find((x) => x.key === b.key).name = name.trim(); saveBanks(banks, `Bank renamed: ${name.trim()}`);
    },
    "bank-move": (el) => {
      const banks = banksCopy(), vis = banks.filter((b) => !b.hidden), i = vis.findIndex((b) => b.key === el.dataset.key), j = i + +el.dataset.dir;
      if (j < 0 || j >= vis.length) return;
      [vis[i], vis[j]] = [vis[j], vis[i]]; saveBanks(vis.concat(banks.filter((b) => b.hidden)), "Bank order");
    },
    "bank-remove": (el) => {
      const key = el.dataset.key, used = S.records.filter((r) => (r.banks[key] || 0) !== 0).length, b = S.banks.find((x) => x.key === key);
      if (!confirm(used ? `${b.name} has values in ${used} entries. Hide it? (past values are kept)` : `Delete ${b.name} completely?`)) return;
      if (used) { const banks = banksCopy(); banks.find((x) => x.key === key).hidden = true; saveBanks(banks, `Bank hidden: ${b.name}`); }
      else saveBanks(S.banks.filter((x) => x.key !== key), `Bank deleted: ${b.name}`, S.records.map((r) => { if (!(key in r.banks)) return r; const c = FE.clone(r); delete c.banks[key]; return c; }));
    },
    "bank-restore": (el) => { const banks = banksCopy(); banks.find((x) => x.key === el.dataset.key).hidden = false; saveBanks(banks, "Bank restored"); },
    "bank-add": () => {
      const name = ($('[data-input="newbank"]').value || "").trim(), kind = "checking";
      if (!name) return toast("Enter a bank name.");
      if (S.banks.some((b) => b.name.toLowerCase() === name.toLowerCase())) return toast("A bank with this name already exists.");
      saveBanks(S.banks.concat([{ key: FE.makeKey(name, S.banks.map((b) => b.key)), name, kind, hidden: false }]), `Bank added: ${name}`);
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const name = el.dataset.action, fn = sheetActions[name] || A[name];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.input;
    if (k === "search") { S.search = e.target.value; $("#list").innerHTML = recordsBody(); }
    if (k === "hide") { S.hide = e.target.checked; ls.set("hide", S.hide ? "1" : "0"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
  $("#sheet").addEventListener("mousedown", (e) => { if (e.target.id === "sheet") closeSheet(); });
  $("#file").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try { openImport(FE.importAny(await file.text()), file.name); }
    catch (err) { toast(err.message || "Could not read the file", 5000); }
  });
  $("#file-positions").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const names = Object.fromEntries(((F.holdings && F.holdings.accounts) || []).filter((a) => a.key).map((a) => [a.key, a.name]));
      const imp = FR.importFidelityCSV(await file.text(), todayS(), names); imp.plan = FR.normalizePlan(F.holdings && F.holdings.plan); openFidEdit(imp, true);
    } catch (err) { toast(err.message || "Could not read the file", 5000); }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  globalThis.addEventListener("finans-sync", () => { const el = $("#sync-msg"); if (el && Store.state.sync) el.textContent = Store.state.sync.message; renderSideFoot(); });
  let wide = matchMedia("(min-width: 900px)").matches;
  addEventListener("resize", () => { const w = matchMedia("(min-width: 900px)").matches; if (w !== wide) { wide = w; render(); } });

  // Pick up changes made elsewhere (another tab, the CSV edited by hand) when this tab comes back.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !$("#sheet").hidden) return;
    try { const d = await Store.loadIfChanged(); if (d) { S.records = d.records; S.banks = d.banks; recompute(); render(); toast("Data updated"); } } catch { /* offline: keep current view */ }
  });

  async function boot() {
    closeSheet();
    $("#view").innerHTML = '<div class="loading">Loading…</div>';
    try {
      const d = await Store.load();
      S.records = d.records; S.banks = d.banks; recompute();
      await loadHoldings();
      render();
      if (d.rejected.length) toast(`${d.rejected.length} rows could not be read`, 5000);
    } catch (e) {
      $("#view").innerHTML = `<div class="error-screen"><h2>Could not load the demo</h2><p>${esc(e.message)}</p><button class="btn primary" data-action="reload">Try again</button></div>`;
    }
  }
  boot();
})();

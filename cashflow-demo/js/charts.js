// Inline-SVG charts: the projected-balance line and the monthly-payments bars.

import { svg, h, money, fmtDate, fmtMonth, fmtMonthShort } from './ui.js';
import { D, Month } from './engine.js';

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) || magnitude * 10;
  const first = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = first; v <= max + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const compact = (value) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${sign}$${Math.round(abs)}`;
};

/** The projected-balance chart. `onSelect(day|null)` reports the hovered day. */
export function balanceChart({ days, threshold, onSelect }) {
  const W = 760;
  const H = 260;
  const pad = { l: 52, r: 12, t: 12, b: 26 };
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Projected balance' });
  if (days.length === 0) return root;

  const values = days.map((d) => d.endingBalance);
  const lo = Math.min(...values, threshold);
  const hi = Math.max(...values, threshold);
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(ticks[0], lo);
  const yMax = Math.max(ticks.at(-1), hi);
  const x = (i) => pad.l + (days.length === 1 ? 0 : (i / (days.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);

  for (const tick of ticks) {
    root.append(
      svg('line', { x1: pad.l, x2: W - pad.r, y1: y(tick), y2: y(tick), class: 'grid' }),
      svg('text', { x: pad.l - 8, y: y(tick) + 4, class: 'axis', 'text-anchor': 'end' }, compact(tick)),
    );
  }

  // x labels: ~6 evenly spaced dates
  const labelCount = Math.min(6, days.length);
  for (let n = 0; n < labelCount; n++) {
    const i = Math.round((n / Math.max(labelCount - 1, 1)) * (days.length - 1));
    const anchor = n === 0 ? 'start' : n === labelCount - 1 ? 'end' : 'middle';
    root.append(svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': anchor }, fmtDate(days[i].date, { month: 'short', day: 'numeric' })));
  }

  const line = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.endingBalance).toFixed(1)}`).join(' ');
  const area = `${line} L${x(days.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  root.append(
    svg('path', { d: area, class: 'area' }),
    svg('line', { x1: pad.l, x2: W - pad.r, y1: y(threshold), y2: y(threshold), class: 'threshold' }),
    svg('path', { d: line, class: 'line' }),
  );

  days.forEach((d, i) => {
    if (d.endingBalance < threshold) root.append(svg('circle', { cx: x(i), cy: y(d.endingBalance), r: 2.6, class: 'low-dot' }));
  });

  const cursor = svg('g', { class: 'cursor', visibility: 'hidden' },
    svg('line', { class: 'cursor-line', y1: pad.t, y2: H - pad.b }),
    svg('circle', { r: 5, class: 'cursor-dot' }),
  );
  root.append(cursor);

  const select = (event) => {
    const box = root.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.min(days.length - 1, Math.max(0, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (days.length - 1))));
    cursor.setAttribute('visibility', 'visible');
    cursor.querySelector('line').setAttribute('x1', x(i));
    cursor.querySelector('line').setAttribute('x2', x(i));
    const dot = cursor.querySelector('circle');
    dot.setAttribute('cx', x(i));
    dot.setAttribute('cy', y(days[i].endingBalance));
    onSelect?.(days[i]);
  };
  root.addEventListener('pointermove', select);
  root.addEventListener('pointerdown', select);
  root.addEventListener('pointerleave', () => {
    cursor.setAttribute('visibility', 'hidden');
    onSelect?.(null);
  });
  return root;
}

/**
 * Bars for monthly totals with an optional rolling-average line.
 * months: [{ month, total }], line: Map(month -> value) | null, currentMonth: highlights in-progress.
 */
export function paymentsChart({ months, line, currentMonth, onSelect }) {
  const W = 760;
  const H = 240;
  const pad = { l: 52, r: 12, t: 14, b: 26 };
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Card payments by month' });
  if (months.length === 0) return root;

  const lineValues = line ? months.map((m) => line.get(m.month)).filter((v) => v != null) : [];
  const top = Math.max(...months.map((m) => m.total), ...lineValues, 1);
  const ticks = niceTicks(0, top);
  const yMax = ticks.at(-1);
  const slot = (W - pad.l - pad.r) / months.length;
  const barWidth = Math.min(46, slot * 0.62);
  const cx = (i) => pad.l + slot * i + slot / 2;
  const y = (v) => pad.t + (1 - v / (yMax || 1)) * (H - pad.t - pad.b);

  for (const tick of ticks) {
    root.append(
      svg('line', { x1: pad.l, x2: W - pad.r, y1: y(tick), y2: y(tick), class: 'grid' }),
      svg('text', { x: pad.l - 8, y: y(tick) + 4, class: 'axis', 'text-anchor': 'end' }, compact(tick)),
    );
  }

  const bars = [];
  months.forEach((m, i) => {
    const bar = svg('rect', {
      x: cx(i) - barWidth / 2, y: y(m.total), width: barWidth, height: Math.max(0, H - pad.b - y(m.total)), rx: 4,
      class: `bar ${m.month === currentMonth ? 'current' : ''} ${line ? 'dim' : ''}`,
    });
    bars.push(bar);
    root.append(bar, svg('text', { x: cx(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, fmtMonthShort(m.month)));
  });

  if (line) {
    const points = months.map((m, i) => ({ i, v: line.get(m.month), month: m.month })).filter((p) => p.v != null);
    if (points.length) {
      const path = points.map((p, n) => `${n === 0 ? 'M' : 'L'}${cx(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
      root.append(svg('path', { d: path, class: 'avg-line' }));
      for (const p of points) {
        root.append(svg('circle', { cx: cx(p.i), cy: y(p.v), r: 4, class: 'avg-dot' }));
      }
    }
  }

  // Hover / touch: highlight the bar under the pointer and report it.
  const clear = () => {
    bars.forEach((b) => b.classList.remove('hover'));
    onSelect?.(null);
  };
  const select = (event) => {
    const box = root.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.floor((px - pad.l) / slot);
    if (i < 0 || i >= months.length) return clear();
    bars.forEach((b, n) => b.classList.toggle('hover', n === i));
    onSelect?.({ ...months[i], average: line ? line.get(months[i].month) ?? null : null });
  };
  root.addEventListener('pointermove', select);
  root.addEventListener('pointerdown', select);
  root.addEventListener('pointerleave', clear);
  return root;
}

export { Month };

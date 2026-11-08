/* CalorieLog demo: diary, sample-photo analysis and a typed-meal parser, all in the browser. */
(function () {
  'use strict';

  var FOODS = window.CL_FOODS || [];
  var TARGET = [2200, 140, 230, 75, 30, 50, 2300]; // kcal, protein, carbs, fat, fiber, sugar, sodium
  var MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
  var STORE = 'calorielog-demo-v1';

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtQty(q) {
    var map = { 0.25: '¼', 0.5: '½', 0.75: '¾' }, w = Math.floor(q), f = Math.round((q - w) * 100) / 100;
    if (map[f]) return (w ? w : '') + map[f];
    return String(Math.round(q * 100) / 100);
  }
  function scale(v, k) { return v.map(function (x) { return x * k; }); }
  function sum(items) {
    var t = [0, 0, 0, 0, 0, 0, 0];
    items.forEach(function (it) { for (var i = 0; i < 7; i++) t[i] += it.per[i] * it.qty; });
    return t;
  }
  function mealByClock(d) {
    var m = d.getHours() * 60 + d.getMinutes();
    if (m < 630) return 'breakfast'; if (m < 900) return 'lunch'; if (m < 1050) return 'snack'; return 'dinner';
  }
  function timeStr(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  /* ---------------- sample photos (results prepared in advance) ---------------- */
  var PHOTOS = [
    { id: 'omelette', src: 'photos/omelette.jpg', title: 'Breakfast table', meal: 'breakfast',
      alt: 'Sample photo: a vegetable and cheese omelette with cherry tomatoes, a small bowl of tomatoes, coffee and a glass of orange juice',
      items: [
        { name: 'Omelette, cheese and vegetables', tag: 'Omelette', qty: 1, u: ['omelette', 'omelettes'], step: 1, per: [420, 26, 8, 31, 2, 4, 620], note: '3 eggs, cheese, mushrooms, peppers, spinach', box: [[32.3, 40.4, 44.4, 39.3]] },
        { name: 'Cherry tomatoes', tag: 'Tomatoes', qty: 8, u: ['tomato', 'tomatoes'], step: 1, per: [3, 0.15, 0.7, 0, 0.2, 0.45, 1], note: 'on the plate and in the bowl', box: [[12.6, 36.8, 16.8, 17.6], [63.6, 47.1, 8.5, 12.1]] },
        { name: 'Orange juice', tag: 'Juice', qty: 1, u: ['glass', 'glasses'], step: 0.5, per: [140, 2.1, 32.5, 0.6, 0.6, 26, 3], note: 'about 10 oz', box: [[80.3, 25, 14.8, 31.3]] },
        { name: 'Coffee with milk', tag: 'Coffee', qty: 1, u: ['cup', 'cups'], step: 1, per: [30, 1.5, 2.5, 1.5, 0, 2.5, 25], note: '8 oz, splash of milk', box: [[64.8, 23.2, 15.6, 21.7]] }
      ] },
    { id: 'pizza', src: 'photos/pizza.jpg', title: 'Pepperoni pizza', meal: 'dinner',
      alt: 'Sample photo: a whole pepperoni pizza on a wooden board with one cheesy slice being lifted',
      info: [{ tag: 'Whole pie · about 14 in, 8 slices', box: [0.6, 17.5, 98.6, 81.8] }],
      items: [
        { name: 'Pizza, pepperoni', tag: '1 slice, pepperoni', qty: 1, u: ['slice', 'slices'], step: 1, per: [310, 13, 34, 13, 2, 4, 720], note: 'the slice being lifted; tap + if you had more', box: [[54.9, 1.4, 44.5, 48.8]] }
      ] }
  ];

  /* ---------------- typed-meal parser ---------------- */
  function sing(w) {
    if (w.length < 4) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/ie$/.test(w)) return w.slice(0, -2) + 'y';
    if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function prep(text) {
    return text.toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/½/g, ' 1/2 ').replace(/¼/g, ' 1/4 ').replace(/¾/g, ' 3/4 ').replace(/⅓/g, ' 1/3 ').replace(/⅔/g, ' 2/3 ')
      .replace(/(\d+)\s+and\s+a\s+half/g, function (m, a) { return ' ' + (+a + 0.5) + ' '; })
      .replace(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/g, function (m, a, b) { return ' ' + ((+a + +b) / 2) + ' '; })
      .replace(/&/g, ' and ')
      .replace(/[,;+\n\r]|\.(?!\d)/g, ' , ')
      .replace(/[()\[\]{}!?:"*#]/g, ' ')
      .replace(/-/g, ' ')
      .replace(/(\d)([a-zçğıöşü])/g, '$1 $2')
      .replace(/(^|\s)x\s*(\d)/g, '$1$2');
  }
  function tokenize(text) {
    var raw = prep(text).split(/\s+/).filter(Boolean);
    return { raw: raw, t: raw.map(sing) };
  }

  var ALIASES = [];
  FOODS.forEach(function (f) {
    f.a.forEach(function (a) { ALIASES.push({ t: tokenize(a).t, len: a.length, food: f }); });
  });
  ALIASES.sort(function (x, y) { return y.t.length - x.t.length || y.len - x.len; });

  var SEP = { ',': 1, and: 1, with: 1, plus: 1, then: 1, also: 1, on: 1, or: 1 };
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 3, dozen: 12, single: 1 };
  var UNITS = { g: 'g', gr: 'g', gram: 'g', gm: 'g', kg: 'kg', kilo: 'kg', oz: 'oz', ounce: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', ml: 'ml', l: 'l', liter: 'l', litre: 'l', cup: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tbs: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', spoon: 'spoon', spoonful: 'spoon', slice: 'slice', piece: 'piece', pc: 'piece', bowl: 'bowl', plate: 'plate', glass: 'glass', can: 'can', bottle: 'bottle', handful: 'handful', scoop: 'scoop', serving: 'serving', portion: 'portion', fillet: 'fillet', bar: 'bar', square: 'square', wedge: 'wedge', link: 'link', strip: 'strip', rasher: 'rasher', shot: 'shot', pint: 'pint', mug: 'mug', cube: 'cube', pat: 'pat', breast: 'breast', order: 'order', bag: 'bag', container: 'container', skewer: 'skewer', floret: 'floret', block: 'block', side: 'side' };
  var WEIGHT = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  var VOL = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5, spoon: 15, glass: 250, mug: 350, pint: 473, shot: 30, bottle: 500, can: 355 };
  var SIZES = { mini: 0.5, small: 0.75, medium: 1, regular: 1, large: 1.3, big: 1.3, huge: 1.6, jumbo: 1.5, tall: 1, grande: 1.33, venti: 1.67 };
  var UNAME = { g: ['g', 'g'], kg: ['kg', 'kg'], oz: ['oz', 'oz'], lb: ['lb', 'lb'], ml: ['ml', 'ml'], l: ['L', 'L'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'], glass: ['glass', 'glasses'], spoon: ['spoonful', 'spoonfuls'] };
  var STOP = { i: 1, id: 1, had: 1, have: 1, having: 1, ate: 1, eat: 1, eaten: 1, just: 1, for: 1, the: 1, a: 1, an: 1, of: 1, some: 1, my: 1, me: 1, today: 1, this: 1, morning: 1, tonight: 1, at: 1, in: 1, it: 1, was: 1, x: 1, breakfast: 1, brunch: 1, lunch: 1, dinner: 1, supper: 1, snack: 1, dessert: 1, extra: 1, half: 1, about: 1, around: 1, like: 1, also: 1, then: 1, after: 1, before: 1, from: 1, to: 1, little: 1, bit: 1, cooked: 1, fresh: 1, homemade: 1, drank: 1, drink: 1 };

  function plural(w) {
    if (/(ch|sh|x|s)$/.test(w)) return w + 'es';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
    if (/(tomato|potato)$/.test(w)) return w + 'es';
    return w + 's';
  }
  function unitNames(u) { return UNAME[u] || [u, plural(u)]; }

  function parseQty(tok) {
    var num = null, half = false, article = false, unit = null, size = null, extra = false, found = false;
    tok.forEach(function (w) {
      if (/^\d+(\.\d+)?$/.test(w) || /^\.\d+$/.test(w)) { var v = parseFloat(w); num = (num != null && num >= 1 && v < 1) ? num + v : v; found = true; }
      else if (/^\d+\/\d+$/.test(w)) { var p = w.split('/'), fr = +p[0] / +p[1]; num = (num != null && num >= 1) ? num + fr : fr; found = true; }
      else if (w === 'a' || w === 'an') { article = true; }
      else if (w === 'half') { half = true; found = true; }
      else if (NUMW[w] != null) { num = (num != null && w === 'dozen') ? num * 12 : NUMW[w]; found = true; }
      else if (UNITS[w] && !unit) { unit = UNITS[w]; found = true; }
      else if (SIZES[w] != null) { size = w; found = true; }
      else if (w === 'extra') { extra = true; }
      else if (w === 'double') { num = (num || 1) * 2; found = true; }
    });
    var q = num != null ? (half && num >= 1 ? num * 0.5 : num) : (half ? 0.5 : 1);
    var mult = size ? SIZES[size] : 1;
    if (extra && size === 'large') mult = 1.5;
    return { qty: q, unit: unit, size: size, mult: mult, found: found || article };
  }

  function perUnit(food, unit) {
    if (!unit) return 1;
    if (food.u[unit] != null) return food.u[unit];
    if (unit === 'oz' && food.ml) return 29.57 / food.ml;
    if (WEIGHT[unit]) return food.g ? WEIGHT[unit] / food.g : (food.ml ? WEIGHT[unit] / food.ml : 1);
    if (VOL[unit] && food.ml) return VOL[unit] / food.ml;
    if ((unit === 'cup' || unit === 'tbsp' || unit === 'tsp' || unit === 'spoon') && food.g) return VOL[unit] * 0.7 / food.g;
    return 1;
  }

  function stepFor(unit, qty) {
    if (unit === 'g' || unit === 'ml') return qty >= 100 ? 25 : 10;
    if (unit === 'oz') return 1;
    if (unit === 'kg' || unit === 'l' || unit === 'lb') return 0.25;
    return (qty % 1 !== 0 || qty < 1) ? 0.5 : 1;
  }

  function parseMeal(text) {
    var tk = tokenize(text), t = tk.t, raw = tk.raw, used = [], matches = [];
    for (var i = 0; i < t.length; i++) used.push(false);
    ALIASES.forEach(function (a) {
      var n = a.t.length;
      for (var i = 0; i + n <= t.length; i++) {
        var ok = true;
        for (var j = 0; j < n; j++) if (used[i + j] || t[i + j] !== a.t[j]) { ok = false; break; }
        if (ok) { for (j = 0; j < n; j++) used[i + j] = true; matches.push({ s: i, e: i + n, food: a.food }); }
      }
    });
    matches.sort(function (x, y) { return x.s - y.s; });

    var items = [], prevEnd = 0;
    matches.forEach(function (m, k) {
      var from = prevEnd;
      for (var i = m.s - 1; i >= prevEnd; i--) if (SEP[t[i]]) { from = i + 1; break; }
      var q = parseQty(t.slice(from, m.s)), phraseS = from, phraseE = m.e;
      if (!q.found) {
        var nextStart = k + 1 < matches.length ? matches[k + 1].s : t.length, to = m.e;
        while (to < nextStart && !SEP[t[to]]) to++;
        var q2 = parseQty(t.slice(m.e, to));
        if (q2.found) { q = q2; phraseE = to; prevEnd = to; } else prevEnd = m.e;
      } else prevEnd = m.e;
      while (phraseS < m.s && STOP[t[phraseS]] && t[phraseS] !== 'a' && t[phraseS] !== 'an' && t[phraseS] !== 'half') phraseS++;

      var f = m.food, unit = q.unit;
      var mult = (f.ns || (/^(tall|grande|venti)$/.test(q.size || '') && !f.ml)) ? 1 : q.mult;
      var spu = perUnit(f, unit) * mult;
      var names = unit ? unitNames(unit) : [f.noun, plural(f.noun)];
      if (!unit && /^(serving|portion)$/.test(f.noun)) names = [f.noun, plural(f.noun)];
      var sizeTag = (mult !== 1 && q.size) ? ' (' + q.size + ')' : '';
      items.push({
        name: f.n + sizeTag, qty: q.qty, u: names, step: stepFor(unit, q.qty), per: scale(f.v, spu),
        note: unit || f.noun === 'serving' || f.noun === 'portion' ? f.basis + ' ≈ ' + fmt(f.v[0]) + ' kcal' : '',
        phrase: raw.slice(phraseS, phraseE).join(' ')
      });
    });

    /* chunks with no recognised food */
    var unknown = [], chunk = [], hit = false;
    function flush() {
      var words = chunk.filter(function (w, idx) { return !STOP[w] && !/^[\d.\/]+$/.test(w) && !UNITS[w] && SIZES[w] == null && NUMW[w] == null; });
      if (!hit && words.length) unknown.push(chunk.map(function (w, idx) { return w; }).join(' '));
      chunk = []; hit = false;
    }
    for (i = 0; i < t.length; i++) {
      if (SEP[t[i]]) { flush(); continue; }
      chunk.push(raw[i]); if (used[i]) hit = true;
    }
    flush();
    unknown = unknown.map(function (c) { return c.replace(/\b(i had|i ate|had|ate|for (breakfast|lunch|dinner))\b/g, '').trim(); }).filter(Boolean);

    var meal = null;
    if (/\b(breakfast|brunch)\b/.test(t.join(' '))) meal = 'breakfast';
    else if (/\blunch\b/.test(t.join(' '))) meal = 'lunch';
    else if (/\b(dinner|supper)\b/.test(t.join(' '))) meal = 'dinner';
    else if (/\b(snack|dessert)\b/.test(t.join(' '))) meal = 'snack';
    return { items: items, unknown: unknown, meal: meal };
  }
  window.CL_parse = parseMeal; // handy for checking in the console

  /* ---------------- diary state ---------------- */
  var today = new Date().toDateString();
  var state = { day: today, entries: [] };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && saved.day === today && Array.isArray(saved.entries)) state = saved;
  } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  /* ---------------- rendering: diary ---------------- */
  var RING_C = 2 * Math.PI * 50;
  function render() {
    var all = [];
    state.entries.forEach(function (e) { all = all.concat(e.items); });
    var t = sum(all), left = TARGET[0] - t[0];
    $('#kcal').textContent = fmt(t[0]);
    $('#left').textContent = left >= 0 ? fmt(left) + ' left' : fmt(-left) + ' over';
    $('#left').classList.toggle('over', left < 0);
    var pct = Math.min(t[0] / TARGET[0], 1);
    $('#ring').style.strokeDashoffset = String(RING_C * (1 - pct));
    [['p', 1], ['c', 2], ['f', 3]].forEach(function (m) {
      $('#v-' + m[0]).textContent = fmt(t[m[1]]);
      $('#b-' + m[0]).style.width = Math.min(100, t[m[1]] / TARGET[m[1]] * 100) + '%';
    });
    $('#v-fib').textContent = fmt(t[4]); $('#v-sug').textContent = fmt(t[5]);
    var na = $('#v-na'); na.textContent = fmt(t[6]); na.classList.toggle('over', t[6] > TARGET[6]);
    $('#v-sug').classList.toggle('over', t[5] > TARGET[5]);

    var box = $('#meals'); box.innerHTML = '';
    $('#logged').textContent = state.entries.length + ' logged';
    if (!state.entries.length) {
      box.appendChild(el('div', 'empty', '<b>Nothing logged yet today.</b><span>Tap the camera to analyze a sample photo, or type a meal below, like “2 eggs and a latte”.</span>'));
      return;
    }
    MEALS.forEach(function (m) {
      var list = state.entries.filter(function (e) { return e.meal === m[0]; });
      if (!list.length) return;
      var mt = 0; list.forEach(function (e) { mt += sum(e.items)[0]; });
      var g = el('div', 'meal');
      g.appendChild(el('div', 'meal-h', '<b>' + m[1] + '</b><span>' + fmt(mt) + ' kcal</span>'));
      list.forEach(function (e) {
        var k = sum(e.items)[0];
        var row = el('div', 'entry' + (e.id === lastAdded ? ' new' : ''));
        var icon = e.src === 'photo'
          ? '<img src="' + esc(e.thumb) + '" alt="">'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
        row.innerHTML = '<div class="e-ic">' + icon + '</div><div class="e-t"><small>' + esc(e.time) + ' · ' + (e.src === 'photo' ? 'from photo' : 'from text') + '</small><span>' + esc(e.title) + '</span></div><b class="e-k">' + fmt(k) + '<small> kcal</small></b><button class="e-x" type="button" aria-label="Remove ' + esc(e.title) + '">×</button>';
        row.querySelector('.e-x').addEventListener('click', function () {
          state.entries = state.entries.filter(function (x) { return x.id !== e.id; }); save(); render();
        });
        g.appendChild(row);
      });
      box.appendChild(g);
    });
  }
  var lastAdded = null;

  /* ---------------- analysis sheet ---------------- */
  var sheet = $('#sheet'), current = null, timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function openSheet(html) {
    clearTimers();
    sheet.innerHTML = '<div class="s-in">' + html + '</div>'; sheet.hidden = false;
    requestAnimationFrame(function () { sheet.classList.add('on'); });
    var x = sheet.querySelector('.s-x'); if (x) x.addEventListener('click', closeSheet);
  }
  function closeSheet() {
    clearTimers(); sheet.classList.remove('on');
    setTimeout(function () { sheet.hidden = true; sheet.innerHTML = ''; }, 220);
    current = null;
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });

  var CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>';

  function choosePhoto() {
    var h = '<div class="s-head"><b>Analyze a photo</b><button class="s-x" type="button" aria-label="Close">×</button></div>' +
      '<p class="s-sub">Pick a sample photo. CalorieLog will find each food and estimate the portion.</p><div class="pick">';
    PHOTOS.forEach(function (p) { h += '<button type="button" class="pick-b" data-id="' + p.id + '"><img src="' + p.src + '" alt="' + esc(p.alt) + '"><span>' + esc(p.title) + '</span></button>'; });
    h += '<div class="pick-b own" aria-disabled="true">' + CAM + '<span>Your own photo</span><small>Works in the private app, where photos go to an AI vision model. Not available in this public demo.</small></div></div>';
    openSheet(h);
    sheet.querySelectorAll('.pick-b[data-id]').forEach(function (b) { b.addEventListener('click', function () { analyzePhoto(b.dataset.id); }); });
  }

  function analyzePhoto(id) {
    var p = PHOTOS.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var items = p.items.map(function (it) { return JSON.parse(JSON.stringify(it)); });
    current = { src: 'photo', thumb: p.src, items: items, meal: p.meal, unknown: [], info: p.info || [] };
    openSheet('<div class="s-head"><b id="s-title">Analyzing photo…</b><button class="s-x" type="button" aria-label="Close">×</button></div>' +
      '<div class="photo scanning" id="photo"><img src="' + p.src + '" alt="' + esc(p.alt) + '"><div class="scan"></div></div>' +
      '<div class="status" id="status"><i class="spin"></i><span>Finding foods in the photo</span></div><div id="result"></div>');
    var steps = ['Finding foods in the photo', 'Estimating portion sizes', 'Calculating nutrients'];
    later(function () { setStatus(steps[1]); }, 800);
    later(function () { setStatus(steps[2]); showBoxes(items); }, 1500);
    later(function () { done('Here’s what I found'); }, 2400);
  }

  function analyzeText(text) {
    text = text.trim(); if (!text) return;
    var r = parseMeal(text);
    current = { src: 'text', items: r.items, meal: r.meal || mealByClock(new Date()), unknown: r.unknown, text: text };
    openSheet('<div class="s-head"><b id="s-title">Reading your description…</b><button class="s-x" type="button" aria-label="Close">×</button></div>' +
      '<blockquote class="said">“' + esc(text) + '”</blockquote>' +
      '<div class="status" id="status"><i class="spin"></i><span>Finding foods and amounts</span></div><div id="result"></div>');
    later(function () { setStatus('Matching portions'); }, 450);
    later(function () {
      if (!r.items.length) {
        $('#s-title').textContent = 'I couldn’t place that one';
        $('#status').remove();
        $('#result').innerHTML = '<div class="miss"><p>This demo reads meals with a built-in table of about 160 common foods, and none of them matched.</p><p>Try something like <button type="button" class="ex-in">a bagel with cream cheese and an orange juice</button>. The private app sends text to an AI model, so it can read anything.</p></div>';
        $('#result .ex-in').addEventListener('click', function (e) { analyzeText(e.target.textContent); });
        return;
      }
      done(r.items.length === 1 ? 'Found 1 food' : 'Found ' + r.items.length + ' foods');
    }, 1000);
  }

  function setStatus(s) { var st = $('#status span'); if (st) st.textContent = s; }

  function showBoxes(items) {
    var ph = $('#photo'); if (!ph) return;
    ph.classList.remove('scanning');
    var n = 0;
    (current.info || []).forEach(function (f) {
      var d = el('div', 'box info');
      d.style.left = f.box[0] + '%'; d.style.top = f.box[1] + '%'; d.style.width = f.box[2] + '%'; d.style.height = f.box[3] + '%';
      d.appendChild(el('span', '', esc(f.tag)));
      ph.appendChild(d);
      later(function () { d.classList.add('in'); }, 0); n++;
    });
    items.forEach(function (it, idx) {
      it.box.forEach(function (b, bi) {
        var d = el('div', 'box');
        d.style.left = b[0] + '%'; d.style.top = b[1] + '%'; d.style.width = b[2] + '%'; d.style.height = b[3] + '%';
        d.dataset.i = idx;
        if (bi === 0) d.appendChild(el('span', '', esc(it.tag)));
        ph.appendChild(d);
        (function (d, delay) { later(function () { d.classList.add('in'); }, delay); })(d, 120 * n++);
      });
    });
  }

  function done(title) {
    $('#s-title').textContent = title;
    var st = $('#status'); if (st) st.remove();
    var r = $('#result');
    var h = '<ul class="items" id="items"></ul>';
    if (current.unknown.length) {
      h += '<p class="unk">Not recognized: ' + current.unknown.map(function (u) { return '<q>' + esc(u) + '</q>'; }).join(', ') + '. The demo’s food table doesn’t include it; the private app’s AI would.</p>';
    }
    h += '<div class="tot" id="tot"></div><div class="meal-pick" role="radiogroup" aria-label="Meal">';
    MEALS.forEach(function (m) { h += '<button type="button" role="radio" data-m="' + m[0] + '">' + m[1] + '</button>'; });
    h += '</div><button type="button" class="add" id="add"></button><p class="fine">Estimates. Adjust any portion that looks off before adding.</p>';
    r.innerHTML = h;
    r.querySelectorAll('.meal-pick button').forEach(function (b) {
      b.addEventListener('click', function () { current.meal = b.dataset.m; syncMeal(); });
    });
    syncMeal();
    $('#add').addEventListener('click', addToDiary);
    drawItems(true);
  }

  function syncMeal() {
    sheet.querySelectorAll('.meal-pick button').forEach(function (b) {
      var on = b.dataset.m === current.meal; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function drawItems(animate) {
    var ul = $('#items'); if (!ul) return;
    ul.innerHTML = '';
    current.items.forEach(function (it, i) {
      var li = el('li', 'item' + (animate ? ' rise' : ''));
      if (animate) li.style.animationDelay = (i * 70) + 'ms';
      var unitLabel = it.qty === 1 ? it.u[0] : it.u[1];
      var sub = current.src === 'text' && it.phrase ? '“' + esc(it.phrase) + '”' + (it.note ? ' · ' + esc(it.note) : '') : esc(it.note || '');
      li.innerHTML = '<div class="i-t"><b>' + esc(it.name) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
        '<div class="i-q"><button type="button" class="dec" aria-label="Less ' + esc(it.name) + '">−</button><span>' + fmtQty(it.qty) + ' ' + esc(unitLabel) + '</span><button type="button" class="inc" aria-label="More ' + esc(it.name) + '">+</button></div>' +
        '<div class="i-k">' + fmt(it.per[0] * it.qty) + '<small> kcal</small></div>';
      li.querySelector('.dec').addEventListener('click', function () { bump(i, -1); });
      li.querySelector('.inc').addEventListener('click', function () { bump(i, 1); });
      li.addEventListener('mouseenter', function () { hl(i, true); });
      li.addEventListener('mouseleave', function () { hl(i, false); });
      ul.appendChild(li);
    });
    var t = sum(current.items);
    $('#tot').innerHTML = '<div><small>Total</small><b>' + fmt(t[0]) + '</b><span>kcal</span></div>' +
      '<ul><li><i style="--m:var(--p)"></i>Protein <b>' + fmt(t[1]) + ' g</b></li><li><i style="--m:var(--c)"></i>Carbs <b>' + fmt(t[2]) + ' g</b></li><li><i style="--m:var(--f)"></i>Fat <b>' + fmt(t[3]) + ' g</b></li></ul>';
    var add = $('#add');
    add.textContent = current.items.length ? 'Add to diary · ' + fmt(t[0]) + ' kcal' : 'Nothing to add';
    add.disabled = !current.items.length;
  }
  function hl(i, on) { sheet.querySelectorAll('.box[data-i="' + i + '"]').forEach(function (b) { b.classList.toggle('hot', on); }); }

  function bump(i, dir) {
    var it = current.items[i];
    var q = Math.round((it.qty + dir * it.step) * 100) / 100;
    if (q <= 0) {
      current.items.splice(i, 1);
      sheet.querySelectorAll('.box[data-i="' + i + '"]').forEach(function (b) { b.remove(); });
      sheet.querySelectorAll('.box[data-i]').forEach(function (b) { var k = +b.dataset.i; if (k > i) b.dataset.i = k - 1; });
    } else it.qty = q;
    drawItems(false);
  }

  function shortName(n) {
    var m = n.match(/^([^,(]+),\s*([^()]+?)(\s*\(.*\))?$/);
    if (!m) return n;
    var base = m[1].trim(), kind = m[2].trim();
    if (/\d|\band\b|\bno\b|\//.test(kind)) return base;
    return kind.charAt(0).toUpperCase() + kind.slice(1) + ' ' + base.toLowerCase();
  }

  function addToDiary() {
    if (!current || !current.items.length) return;
    var d = new Date();
    var names = current.items.map(function (it) { return shortName(it.name); });
    var e = { id: 'e' + d.getTime(), meal: current.meal, time: timeStr(d), src: current.src, thumb: current.thumb || '', title: names.join(', '), items: current.items };
    state.entries.push(e); lastAdded = e.id; save();
    closeSheet(); render();
    var row = document.querySelector('.entry.new');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#q').value = '';
  }

  /* ---------------- wiring ---------------- */
  var dateEl = $('#date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  $('#ring').style.strokeDasharray = String(RING_C);

  $('#cam').addEventListener('click', choosePhoto);
  $('#bar').addEventListener('submit', function (e) { e.preventDefault(); analyzeText($('#q').value); });

  function toDevice() {
    var dev = $('#device');
    if (window.innerWidth < 960) dev.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('[data-photo]').forEach(function (b) {
    b.addEventListener('click', function () { toDevice(); analyzePhoto(b.dataset.photo); });
  });
  document.querySelectorAll('[data-text]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.dataset.text; $('#q').value = t; toDevice(); analyzeText(t);
    });
  });
  $('#reset').addEventListener('click', function () { state.entries = []; save(); closeSheet(); render(); });

  render();
})();

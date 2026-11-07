import { store } from './store.js';
import { h } from './ui.js';
import {
  dashboardView, incomeListView, incomeDetailView, paymentListView, paymentDetailView,
  cardListView, cardDetailView, cardReportView, settingsView,
} from './views.js';

// Feather-style line icons (24x24 paths).
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  income: '<path d="M12 3v14"/><path d="m6 11 6 6 6-6"/><path d="M4 21h16"/>',
  payments: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  cards: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'income', label: 'Income' },
  { id: 'payments', label: 'Payments' },
  { id: 'cards', label: 'Cards' },
  { id: 'settings', label: 'Settings' },
];

function route() {
  const [, section = 'dashboard', a, b] = location.hash.replace(/^#/, '').split('/');
  switch (section) {
    case 'income': return { tab: 'income', view: a ? () => incomeDetailView(a) : incomeListView };
    case 'payments': return { tab: 'payments', view: a ? () => paymentDetailView(a) : paymentListView };
    case 'cards':
      if (a === 'report') return { tab: 'cards', view: () => cardReportView(b) };
      return { tab: 'cards', view: a ? () => cardDetailView(a) : cardListView };
    case 'settings': return { tab: 'settings', view: settingsView };
    default: return { tab: 'dashboard', view: dashboardView };
  }
}

function renderNav(active) {
  document.getElementById('nav').replaceChildren(
    ...TABS.map((t) => h('a', { href: `#/${t.id}`, class: t.id === active ? 'active' : '' },
      h('span', { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.id]}</svg>`, style: { display: 'inline-flex' } }), t.label)),
  );
}

function render() {
  const { tab, view } = route();
  renderNav(tab);
  const main = document.getElementById('view');
  const scroll = window.scrollY;
  try {
    main.replaceChildren(view());
  } catch (error) {
    console.error(error);
    main.replaceChildren(h('div', { class: 'card pad' }, h('h3', null, 'Something went wrong'), h('pre', null, String(error.stack || error))));
  }
  window.scrollTo(0, scroll);
}

function renderStatus() {
  const el = document.getElementById('status');
  const { state, message } = store.status;
  el.className = `status ${state}`;
  el.textContent = message;
  const banner = document.getElementById('banner');
  banner.hidden = state !== 'conflict';
  if (state === 'conflict') {
    banner.replaceChildren(message + ' ', h('button', { class: 'btn small', onclick: () => location.reload() }, 'Reload'));
  }
}

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});
store.subscribe(render);
store.subscribeStatus(renderStatus);

// A new day changes "today", so redraw when the tab becomes visible again.
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    render();
  }
});

window.addEventListener('beforeunload', () => { if (store._dirty) store.flush(); });

store.load()
  .then(() => {
    if (!location.hash) location.hash = store.isEmpty ? '#/settings' : '#/dashboard';
    render();
  })
  .catch((error) => {
    document.getElementById('view').replaceChildren(h('div', { class: 'card pad' }, h('h3', null, 'Could not start the demo'), h('p', null, String(error.message))));
  });

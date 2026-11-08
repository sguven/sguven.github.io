/* Shared behaviour: image lightbox and "viewed project" tracking (kept in this browser only). */
var SG = (function () {
  function loadSeen(key) {
    var out = {};
    try { (JSON.parse(localStorage.getItem(key)) || []).forEach(function (id) { out[id] = 1; }); } catch (e) {}
    return out;
  }
  function saveSeen(key, seen) {
    try { localStorage.setItem(key, JSON.stringify(Object.keys(seen))); } catch (e) {}
  }
  /* A project counts as viewed after it has been on screen for a moment, or when anything in it is clicked. */
  function watchViews(cards, mark, isSeen) {
    cards.forEach(function (c) {
      c.addEventListener('click', function (e) { if (e.target.closest('a')) mark(c.dataset.id); });
    });
    if (!('IntersectionObserver' in window)) return;
    var timers = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.dataset.id;
        var vis = en.isIntersecting && (en.intersectionRatio >= 0.6 || en.intersectionRect.height >= window.innerHeight * 0.5);
        if (vis && !timers[id] && !isSeen(id)) { timers[id] = setTimeout(function () { mark(id); }, 1200); }
        else if (!vis && timers[id]) { clearTimeout(timers[id]); timers[id] = null; }
      });
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    cards.forEach(function (c) { io.observe(c); });
  }
  /* Lightbox for any a[data-lightbox]; caption comes from data-cap. */
  function lightbox() {
    var lb = document.getElementById('lb');
    if (!lb) return;
    var img = lb.querySelector('img'), cap = lb.querySelector('.lb-cap'), last = null;
    function open(a) {
      last = a;
      var i = a.querySelector('img');
      img.src = a.getAttribute('href');
      img.alt = i ? i.alt : '';
      cap.textContent = a.getAttribute('data-cap') || '';
      lb.hidden = false;
      requestAnimationFrame(function () { lb.classList.add('on'); });
      document.body.style.overflow = 'hidden';
      lb.querySelector('.lb-x').focus();
    }
    function close() {
      lb.classList.remove('on'); lb.hidden = true; document.body.style.overflow = '';
      if (last) last.focus();
    }
    document.querySelectorAll('a[data-lightbox]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); open(a); });
    });
    lb.addEventListener('click', function (e) { if (!e.target.closest('.lb-box img')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
  lightbox();
  return { loadSeen: loadSeen, saveSeen: saveSeen, watchViews: watchViews };
})();

(function () {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  $("yil").textContent = new Date().getFullYear();

  /* ---------- Sekmeler ---------- */
  var SEKMELER = ["gezilerim", "yemeklerim", "eserlerim", "ben"];
  function sekmeAc() {
    var h = location.hash.replace("#", "");
    if (SEKMELER.indexOf(h) < 0) h = "gezilerim";
    SEKMELER.forEach(function (s) { $(s).hidden = s !== h; });
    document.querySelectorAll(".sekmeler a").forEach(function (a) {
      a.classList.toggle("aktif", a.dataset.sekme === h);
    });
    panelKapat();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", sekmeAc);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getJSON(yol) {
    return fetch(yol, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(yol + " " + r.status);
      return r.json();
    });
  }

  /* ---------- Harita ---------- */
  // iller.js ile aynı projeksiyon (enlem/boylam -> SVG koordinatı)
  var C = Math.cos(39 * Math.PI / 180), K = 1000 / ((44.82 - 25.66) * C);
  function proj(lat, lon) { return [(lon - 25.66) * C * K, (42.12 - lat) * K]; }

  var svg = $("harita"), ipucu = $("ipucu"), cerceve = svg.parentNode;
  var dokunmatik = window.matchMedia("(hover: none)").matches;
  var ilKayit = {}, ilceKayit = {}, ilElem = {}, pinElem = {}, secili = null;

  function haritaKur(veri) {
    svg.setAttribute("viewBox", window.TR_VIEWBOX);
    svg.innerHTML = '<defs><pattern id="tarama" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect class="tarama-zemin" width="7" height="7"/><line class="tarama-cizgi" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>';
    var gIl = document.createElementNS(SVGNS, "g");
    var gPin = document.createElementNS(SVGNS, "g");
    svg.appendChild(gIl); svg.appendChild(gPin);

    veri.iller.forEach(function (k) { ilKayit[k.ad] = k; });
    veri.ilceler.forEach(function (k) { ilceKayit[k.ad] = k; });

    Object.keys(window.TR_ILLER).forEach(function (ad) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", window.TR_ILLER[ad]);
      p.setAttribute("class", "il");
      p.dataset.ad = ad;
      if (ilKayit[ad]) {
        p.classList.add("gez", "r" + renk(ad));
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "button");
        p.setAttribute("aria-label", ad + ", detayları aç");
      }
      gIl.appendChild(p);
      ilElem[ad] = p;
      if (ilKayit[ad]) {
        var bb = p.getBBox();
        p.style.setProperty("--d", ((bb.x + bb.width / 2) / 1000 * 1.1).toFixed(2) + "s");
      }
    });
    svg.classList.add("giris");
    setTimeout(function () { svg.classList.remove("giris"); }, 2200);

    veri.ilceler.forEach(function (k) {
      if (!k.konum) return;
      var xy = proj(k.konum[0], k.konum[1]);
      var g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "pin");
      g.setAttribute("transform", "translate(" + xy[0].toFixed(1) + "," + xy[1].toFixed(1) + ")");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", k.ad + ", detayları aç");
      g.dataset.ilce = k.ad;
      g.innerHTML = '<circle class="vur" r="' + (window.innerWidth < 700 ? 26 : 14) + '"/><circle class="dalga" r="6"/><circle class="ic" r="5.5"/><text x="8" y="-7">' + esc(k.ad) + "</text>";
      gPin.appendChild(g);
      pinElem[k.ad] = g;
    });

    // Olaylar (tek dinleyici)
    svg.addEventListener("mousemove", function (e) {
      var hedef = hedefBul(e.target);
      if (!hedef || dokunmatik) { ipucu.hidden = true; return; }
      var r = cerceve.getBoundingClientRect();
      ipucu.style.left = (e.clientX - r.left) + "px";
      ipucu.style.top = (e.clientY - r.top) + "px";
      ipucu.style.setProperty("--ip", hedef.renk);
      ipucu.innerHTML = esc(hedef.ad) + "<small>" + esc(hedef.alt) + "</small>";
      ipucu.hidden = false;
    });
    // Üstüne gelinen ili öne al, büyürken komşularının altında kalmasın
    svg.addEventListener("mouseover", function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains("gez") && t.parentNode.lastChild !== t) t.parentNode.appendChild(t);
    });
    svg.addEventListener("mouseleave", function () { ipucu.hidden = true; });
    svg.addEventListener("click", function (e) {
      var hedef = hedefBul(e.target);
      if (hedef && hedef.ac) hedef.ac();
    });
    svg.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var hedef = hedefBul(e.target);
      if (hedef && hedef.ac) { e.preventDefault(); hedef.ac(); }
    });
  }

  function hedefBul(el) {
    var pin = el.closest && el.closest(".pin");
    if (pin) {
      var k = ilceKayit[pin.dataset.ilce];
      return { ad: k.ad, alt: k.il + " · tıkla", renk: renkVar(k.il), ac: function () { detayAc("ilce", k.ad); } };
    }
    if (el.classList && el.classList.contains("il")) {
      var ad = el.dataset.ad;
      if (ilKayit[ad]) return { ad: ad, alt: (ilKayit[ad].ozet || "Gezdim") + " · tıkla", renk: renkVar(ad), ac: function () { detayAc("il", ad); } };
      return { ad: ad, alt: "Sırada", renk: "var(--soluk)" };
    }
    return null;
  }

  var RENKLER = ["var(--nar)", "var(--safran)", "var(--turkuaz)", "var(--civit)", "var(--kiremit)"];
  function renk(ad) { var r = (window.TR_RENK || {})[ad]; return r == null ? 0 : r; }
  function renkVar(ad) { return RENKLER[renk(ad)]; }

  /* ---------- Detay paneli ---------- */
  var panel = $("panel"), perde = $("perde"), sonOdak = null;

  function fotolar(liste) {
    if (!liste || !liste.length) {
      return '<div class="foto-izgara"><div class="foto-yer">Fotoğraf</div><div class="foto-yer">Fotoğraf</div></div>';
    }
    return '<div class="foto-izgara">' + liste.map(function (f) {
      if (typeof f === "string") f = { src: f };
      return '<figure><img loading="lazy" src="' + esc(f.src) + '" alt="' + esc(f.aciklama || "") + '">' +
        (f.aciklama ? "<figcaption>" + esc(f.aciklama) + "</figcaption>" : "") + "</figure>";
    }).join("") + "</div>";
  }

  function detayAc(tur, ad) {
    var k = tur === "il" ? ilKayit[ad] : ilceKayit[ad];
    if (!k) return;
    if (secili) secili.classList.remove("secili");
    secili = tur === "il" ? ilElem[ad] : pinElem[ad];
    if (secili) secili.classList.add("secili");

    panel.style.setProperty("--p", renkVar(tur === "il" ? ad : k.il));
    $("p-tur").textContent = tur === "il" ? "İl" : "İlçe · " + k.il;
    $("p-ad").textContent = k.ad;
    $("p-tarih").textContent = k.tarih ? "Ziyaret: " + k.tarih : "";

    var h = "";
    if (k.ozet) h += "<p><strong>" + esc(k.ozet) + "</strong></p>";
    if (k.aciklama) {
      h += String(k.aciklama).split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    }
    if (!k.ozet && !k.aciklama) {
      h += '<div class="bos-not">Bu yer için henüz not yazılmadı. Detaylar yakında burada olacak.</div>';
    }
    h += fotolar(k.fotograflar);
    if (k.etiketler && k.etiketler.length) {
      h += '<div class="etiketler">' + k.etiketler.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>";
    }
    if (tur === "il") {
      var alt = Object.keys(ilceKayit).filter(function (n) { return ilceKayit[n].il === ad; });
      if (alt.length) {
        h += '<div class="alt-baslik">Bu ilde uğradığım yerler</div><div class="cipler">' +
          alt.map(function (n) { return '<button class="cip ilce" data-ilce="' + esc(n) + '"><span class="nokta"></span>' + esc(n) + "</button>"; }).join("") + "</div>";
      }
    } else if (ilKayit[k.il]) {
      h += '<div class="alt-baslik">Bağlı olduğu il</div><div class="cipler"><button class="cip" data-il="' + esc(k.il) + '">' + esc(k.il) + "</button></div>";
    }
    $("p-govde").innerHTML = h;

    if (!panel.classList.contains("acik")) sonOdak = document.activeElement;
    perde.hidden = false;
    panel.classList.add("acik");
    panel.setAttribute("aria-hidden", "false");
    ipucu.hidden = true;
    $("p-kapat").focus({ preventScroll: true });
  }

  function panelKapat() {
    if (!panel.classList.contains("acik")) return;
    panel.classList.remove("acik");
    panel.setAttribute("aria-hidden", "true");
    perde.hidden = true;
    if (secili) { secili.classList.remove("secili"); secili = null; }
    if (sonOdak && sonOdak.focus) sonOdak.focus({ preventScroll: true });
  }

  $("p-kapat").addEventListener("click", panelKapat);
  perde.addEventListener("click", panelKapat);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") panelKapat(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-il],[data-ilce]");
    if (!b || b.tagName !== "BUTTON") return;
    if (b.dataset.ilce) detayAc("ilce", b.dataset.ilce); else detayAc("il", b.dataset.il);
  });

  /* ---------- Liste ve sayaçlar ---------- */
  function listeKur(veri) {
    var tr = function (a, b) { return a.ad.localeCompare(b.ad, "tr"); };
    var html = veri.iller.slice().sort(tr).map(function (k) {
      return '<button class="cip" style="--r:' + renkVar(k.ad) + '" data-il="' + esc(k.ad) + '">' + esc(k.ad) + "</button>";
    }).concat(veri.ilceler.slice().sort(tr).map(function (k) {
      return '<button class="cip ilce" style="--r:' + renkVar(k.il) + '" data-ilce="' + esc(k.ad) + '"><span class="nokta"></span>' + esc(k.ad) + "</button>";
    })).join("");
    var adlar = veri.iller.concat(veri.ilceler).map(function (k) { return "<span>" + esc(k.ad) + "</span><i>✦</i>"; }).join("");
    $("kayan").innerHTML = adlar + adlar;
    $("liste").innerHTML = html;
    sayac($("s-il"), veri.iller.length, "");
    sayac($("s-ilce"), veri.ilceler.length, "");
    sayac($("s-oran"), Math.round(veri.iller.length / 81 * 100), "%");
  }
  function sayac(el, hedef, ek) {
    var t0 = null, sure = 900;
    function adim(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / sure);
      el.textContent = (ek === "%" ? "%" : "") + Math.round(hedef * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(adim);
    }
    requestAnimationFrame(adim);
  }

  /* ---------- Yemekler / Eserler ---------- */
  function kartlar(el, liste, ust, linkAlan) {
    el.innerHTML = liste.map(function (k) {
      var foto = k.foto ? '<img loading="lazy" src="' + esc(k.foto) + '" alt="' + esc(k.ad) + '">' : "<span>" + esc((k.ad || "?").charAt(0)) + "</span>";
      var u = ust(k);
      return '<article class="kart"><div class="kart-foto">' + foto + '</div><div class="kart-ic">' +
        (u ? '<div class="ust-yazi">' + esc(u) + "</div>" : "") +
        "<h3>" + esc(k.ad) + "</h3><p>" + esc(k.ozet) + "</p>" +
        (linkAlan && k[linkAlan] ? '<a href="' + esc(k[linkAlan]) + '" target="_blank" rel="noopener">Göz at →</a>' : "") +
        "</div></article>";
    }).join("");
  }

  /* ---------- Başlat ---------- */
  sekmeAc();
  getJSON("veri/gezilerim.json").then(function (v) { haritaKur(v); listeKur(v); })
    .catch(function (e) { console.error(e); $("liste").textContent = "Gezi verisi yüklenemedi."; });
  getJSON("veri/yemeklerim.json").then(function (v) {
    kartlar($("yemek-izgara"), v.yemekler, function (k) { return k.kategori; });
  }).catch(console.error);
  getJSON("veri/eserlerim.json").then(function (v) {
    kartlar($("eser-izgara"), v.eserler, function (k) { return [k.tur, k.yil].filter(Boolean).join(" · "); }, "baglanti");
  }).catch(console.error);
})();

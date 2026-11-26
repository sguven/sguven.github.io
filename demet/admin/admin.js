(function () {
  "use strict";
  var A = window.PANEL_AYAR;
  var $ = function (id) { return document.getElementById(id); };
  var ANAHTAR_KEY = "demet-panel-anahtar";
  var anahtar = "";
  try { anahtar = localStorage.getItem(ANAHTAR_KEY) || ""; } catch (e) {}
  $("siteye").href = A.site;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(s) {
    var m = { "ç": "c", "ğ": "g", "ı": "i", "İ": "i", "ö": "o", "ş": "s", "ü": "u", "Ç": "c", "Ğ": "g", "Ö": "o", "Ş": "s", "Ü": "u" };
    return String(s).replace(/[çğıİöşüÇĞÖŞÜ]/g, function (c) { return m[c]; })
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "foto";
  }

  /* ---------- GitHub ---------- */
  function api(yol, secenek) {
    secenek = secenek || {};
    secenek.headers = Object.assign({
      "Authorization": "Bearer " + anahtar,
      "Accept": "application/vnd.github+json"
    }, secenek.headers || {});
    return fetch("https://api.github.com/repos/" + A.sahip + "/" + A.depo + yol, secenek).then(function (r) {
      if (r.status === 401) throw new Error("Anahtar geçersiz ya da süresi dolmuş.");
      if (r.status === 403) throw new Error("Bu anahtarın bu siteye yazma izni yok.");
      if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub hatası " + r.status + ": " + t.slice(0, 160)); });
      return r.json();
    });
  }
  function b64Coz(b64) {
    var bin = atob(b64.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64Kodla(metin) {
    var bytes = new TextEncoder().encode(metin), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function dosyaOku(yol) {
    return api("/contents/" + encodeURI(A.kok + yol) + "?ref=" + A.dal + "&t=" + Date.now()).then(function (j) {
      return { veri: JSON.parse(b64Coz(j.content)), sha: j.sha };
    });
  }
  function dosyaYaz(yol, icerikB64, mesaj, sha) {
    var govde = { message: mesaj, content: icerikB64, branch: A.dal };
    if (sha) govde.sha = sha;
    return api("/contents/" + encodeURI(A.kok + yol), { method: "PUT", body: JSON.stringify(govde) });
  }
  function jsonKaydet(yol, veri, mesaj) {
    // En güncel sha ile yaz
    return api("/contents/" + encodeURI(A.kok + yol) + "?ref=" + A.dal + "&t=" + Date.now()).then(function (j) {
      return dosyaYaz(yol, b64Kodla(JSON.stringify(veri, null, 2) + "\n"), mesaj, j.sha);
    });
  }

  /* Fotoğrafı küçült (en uzun kenar 1600px, JPEG) */
  function kucult(dosya) {
    return new Promise(function (coz, red) {
      var img = new Image(), url = URL.createObjectURL(dosya);
      img.onload = function () {
        var o = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * o); c.height = Math.round(img.naturalHeight * o);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var veriUrl = c.toDataURL("image/jpeg", 0.82);
        coz({ b64: veriUrl.split(",")[1], onizleme: veriUrl });
      };
      img.onerror = function () { red(new Error(dosya.name + " açılamadı. JPEG ya da PNG fotoğraf seç.")); };
      img.src = url;
    });
  }
  function fotoYukle(bekleyen, onEk) {
    // bekleyen: {b64, aciklama}; sırayla yükler, src döner
    var ad = "img/" + slug(onEk) + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + ".jpg";
    return dosyaYaz(ad, bekleyen.b64, "Panel: fotoğraf eklendi (" + onEk + ")").then(function () { return ad; });
  }

  /* ---------- Giriş ---------- */
  function girisGoster(mesaj) {
    ["gezilerim", "liste-bolum"].forEach(function (s) { $(s).hidden = true; });
    $("sekmeler").hidden = true;
    $("giris").hidden = false;
    if (mesaj) { $("giris-durum").textContent = mesaj; $("giris-durum").className = "durum hata"; }
  }
  $("giris-dugme").addEventListener("click", function () {
    anahtar = $("anahtar").value.trim();
    if (!anahtar) return;
    $("giris-durum").className = "durum"; $("giris-durum").textContent = "Kontrol ediliyor…";
    api("").then(function (depo) {
      if (!depo.permissions || !depo.permissions.push) throw new Error("Bu anahtarın bu siteye yazma izni yok.");
      try { localStorage.setItem(ANAHTAR_KEY, anahtar); } catch (e) {}
      $("anahtar").value = "";
      basla();
    }).catch(function (e) { girisGoster(e.message); });
  });

  /* ---------- Sekmeler ---------- */
  var yuklendi = false;
  function sekmeAc() {
    if (!anahtar) return girisGoster();
    var h = location.hash.replace("#", "") || "gezilerim";
    $("giris").hidden = true;
    $("sekmeler").hidden = false;
    document.querySelectorAll("#sekmeler a[data-sekme]").forEach(function (a) { a.classList.toggle("aktif", a.dataset.sekme === h); });
    $("gezilerim").hidden = h !== "gezilerim";
    $("liste-bolum").hidden = h === "gezilerim";
    if (h === "yemeklerim") listeKur(YEMEK);
    if (h === "eserlerim") listeKur(ESER);
  }
  window.addEventListener("hashchange", sekmeAc);

  /* ---------- Gezilerim ---------- */
  var gezi = null, seciliYer = null, bekleyenler = [];
  function yerleriCiz() {
    var q = $("ara").value.trim().toLocaleLowerCase("tr");
    var tr = function (a, b) { return a.ad.localeCompare(b.ad, "tr"); };
    var grup = function (baslik, liste, tur) {
      liste = liste.filter(function (k) { return !q || k.ad.toLocaleLowerCase("tr").indexOf(q) >= 0; }).sort(tr);
      if (!liste.length) return "";
      return '<div class="grup">' + baslik + "</div>" + liste.map(function (k) {
        var sec = seciliYer && seciliYer.tur === tur && seciliYer.ad === k.ad ? " secili" : "";
        var n = (k.fotograflar || []).length;
        return '<button class="cip' + sec + '" data-tur="' + tur + '" data-ad="' + esc(k.ad) + '">' + esc(k.ad) +
          (n ? ' <small style="color:var(--soluk)">· ' + n + " foto</small>" : "") + "</button>";
      }).join("");
    };
    $("yerler").innerHTML = grup("İller", gezi.veri.iller, "iller") + grup("İlçe ve şehirler", gezi.veri.ilceler, "ilceler") +
      grup("Yurt dışı", gezi.veri.yurtdisi || [], "yurtdisi");
  }
  $("ara").addEventListener("input", yerleriCiz);
  $("yerler").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tur]");
    if (!b) return;
    if (bekleyenler.length && !confirm("Kaydedilmemiş fotoğrafların var. Yine de başka yere geçilsin mi?")) return;
    seciliYer = { tur: b.dataset.tur, ad: b.dataset.ad };
    bekleyenler = [];
    yerleriCiz(); yerDuzenCiz();
    if (window.innerWidth < 820) $("yer-duzen").scrollIntoView({ behavior: "smooth" });
  });

  function kayitBul() {
    return (gezi.veri[seciliYer.tur] || []).filter(function (k) { return k.ad === seciliYer.ad; })[0];
  }

  function yerDuzenCiz() {
    var k = kayitBul();
    if (!k) { $("yer-duzen").innerHTML = '<div class="bos">Soldan bir yer seç.</div>'; return; }
    var tur = seciliYer.tur === "iller" ? "İl" : seciliYer.tur === "ilceler" ? "İlçe · " + k.il : "Yurt dışı · " + k.ulke;
    var fotolar = (k.fotograflar || []).map(function (f, i) {
      return '<div class="f"><img src="../' + esc(f.src) + '" alt="" loading="lazy" onerror="this.style.opacity=.3">' +
        '<input type="text" data-foto="' + i + '" value="' + esc(f.aciklama || "") + '" placeholder="Açıklama">' +
        '<div class="alt"><span>Yayında</span><button data-sil="' + i + '">Kaldır</button></div></div>';
    }).join("") + bekleyenler.map(function (f, i) {
      return '<div class="f yeni"><img src="' + f.onizleme + '" alt="">' +
        '<input type="text" data-bekleyen="' + i + '" value="' + esc(f.aciklama || "") + '" placeholder="Açıklama">' +
        '<div class="alt"><span>Kaydedince eklenecek</span><button data-bsil="' + i + '">Kaldır</button></div></div>';
    }).join("");
    $("yer-duzen").innerHTML =
      '<span class="p-tur">' + esc(tur) + '</span><h2 style="font-size:34px;margin:2px 0 4px">' + esc(k.ad) + "</h2>" +
      '<label for="f-tarih">Ne zaman gittin? <small>(ör. Ağustos 2023)</small></label><input id="f-tarih" type="text" value="' + esc(k.tarih) + '">' +
      '<label for="f-ozet">Kısa not <small>(haritada üstüne gelince görünür)</small></label><input id="f-ozet" type="text" maxlength="90" value="' + esc(k.ozet) + '">' +
      '<label for="f-aciklama">Anlatmak istediklerin <small>(paragrafları boş satırla ayır)</small></label><textarea id="f-aciklama">' + esc(k.aciklama) + "</textarea>" +
      '<label for="f-etiket">Etiketler <small>(virgülle ayır, ör. deniz, yemek, aile)</small></label><input id="f-etiket" type="text" value="' + esc((k.etiketler || []).join(", ")) + '">' +
      "<label>Fotoğraflar</label>" +
      '<div class="foto-duzen">' + fotolar + '<label class="yukle" for="f-dosya">+ Fotoğraf ekle<br><small style="font-weight:400">birden fazla seçebilirsin</small></label></div>' +
      '<input id="f-dosya" type="file" accept="image/*" multiple hidden>' +
      '<div class="satir"><button class="dugme" id="kaydet">Kaydet ve yayınla</button><a class="dugme ikincil" href="' + esc(A.site) + '" target="_blank" rel="noopener">Sitede gör ↗</a></div>' +
      '<div class="durum" id="durum"></div>';
  }

  $("yer-duzen").addEventListener("change", function (e) {
    if (e.target.id !== "f-dosya") return;
    var dosyalar = Array.prototype.slice.call(e.target.files);
    durum("Fotoğraflar hazırlanıyor…");
    formuKayda();
    Promise.all(dosyalar.map(kucult)).then(function (ler) {
      ler.forEach(function (f) { f.aciklama = ""; bekleyenler.push(f); });
      yerDuzenCiz(); durum(ler.length + " fotoğraf eklendi. Açıklama yazıp “Kaydet”e bas.", "iyi");
    }).catch(function (err) { durum(err.message, "hata"); });
  });
  $("yer-duzen").addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.bekleyen != null) bekleyenler[+t.dataset.bekleyen].aciklama = t.value;
  });
  $("yer-duzen").addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.sil != null) {
      if (!confirm("Bu fotoğraf sitenden kaldırılsın mı? (Kaydet’e basınca)")) return;
      formuKayda(); kayitBul().fotograflar.splice(+t.dataset.sil, 1); yerDuzenCiz();
      durum("Kaldırmak için “Kaydet”e bas.");
    } else if (t.dataset.bsil != null) {
      formuKayda(); bekleyenler.splice(+t.dataset.bsil, 1); yerDuzenCiz();
    } else if (t.id === "kaydet") {
      yerKaydet();
    }
  });

  function formuKayda() {
    var k = kayitBul(); if (!k || !$("f-tarih")) return;
    k.tarih = $("f-tarih").value.trim();
    k.ozet = $("f-ozet").value.trim();
    k.aciklama = $("f-aciklama").value.trim();
    k.etiketler = $("f-etiket").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    k.fotograflar = k.fotograflar || [];
    document.querySelectorAll("#yer-duzen input[data-foto]").forEach(function (inp) {
      if (k.fotograflar[+inp.dataset.foto]) k.fotograflar[+inp.dataset.foto].aciklama = inp.value.trim();
    });
  }
  function durum(m, tur) { var d = $("durum"); if (d) { d.textContent = m; d.className = "durum" + (tur ? " " + tur : ""); } }

  function yerKaydet() {
    formuKayda();
    var k = kayitBul(), btn = $("kaydet");
    btn.disabled = true;
    var sira = Promise.resolve(), say = 0;
    bekleyenler.forEach(function (f) {
      sira = sira.then(function () {
        durum("Fotoğraf yükleniyor (" + (++say) + "/" + bekleyenler.length + ")…");
        return fotoYukle(f, k.ad).then(function (src) { k.fotograflar.push({ src: src, aciklama: f.aciklama.trim() }); });
      });
    });
    sira.then(function () {
      durum("Kaydediliyor…");
      return jsonKaydet("veri/gezilerim.json", gezi.veri, "Panel: " + k.ad + " güncellendi");
    }).then(function () {
      bekleyenler = [];
      yerleriCiz(); yerDuzenCiz();
      durum("Kaydedildi. Sitede 1–2 dakika içinde görünecek.", "iyi");
    }).catch(function (e) {
      durum("Kaydedilemedi: " + e.message, "hata");
      btn.disabled = false;
    });
  }

  /* Yeni yer */
  $("yeni-yer-ac").addEventListener("click", function () {
    if (bekleyenler.length && !confirm("Kaydedilmemiş fotoğrafların var. Yine de devam edilsin mi?")) return;
    bekleyenler = []; seciliYer = null; yerleriCiz();
    var var_ = {}; gezi.veri.iller.forEach(function (k) { var_[k.ad] = 1; });
    var eksik = Object.keys(window.TR_ILLER).filter(function (n) { return !var_[n]; }).sort(function (a, b) { return a.localeCompare(b, "tr"); });
    $("yer-duzen").innerHTML = '<h2 style="font-size:30px;margin:0 0 4px">Yeni yer</h2>' +
      '<label for="y-tur">Ne eklemek istiyorsun?</label><select id="y-tur"><option value="il">Yeni bir il (haritada boyanır)</option><option value="ilce">İlçe ya da kasaba (haritada iğne olur)</option></select>' +
      '<div id="y-il"><label for="y-il-sec">İl</label><select id="y-il-sec">' + eksik.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + "</select></div>" +
      '<div id="y-ilce" hidden><label for="y-ad">Yerin adı</label><input id="y-ad" type="text" placeholder="ör. Kaş">' +
      '<label for="y-ilce-il">Bağlı olduğu il</label><select id="y-ilce-il">' + Object.keys(window.TR_ILLER).sort(function (a, b) { return a.localeCompare(b, "tr"); }).map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") + "</select>" +
      '<label for="y-konum">Haritadaki yeri <small>(Google Haritalar’da yere sağ tıklayınca çıkan iki sayıyı yapıştır, ör. 36.20, 29.64)</small></label><input id="y-konum" type="text" placeholder="36.20, 29.64"></div>' +
      '<div class="satir"><button class="dugme" id="y-ekle">Ekle ve kaydet</button></div><div class="durum" id="durum"></div>';
    $("y-tur").addEventListener("change", function () {
      $("y-il").hidden = this.value !== "il"; $("y-ilce").hidden = this.value === "il";
    });
    $("y-ekle").addEventListener("click", function () {
      var bos = { tarih: "", ozet: "", aciklama: "", fotograflar: [], etiketler: [] }, yeni, tur;
      if ($("y-tur").value === "il") {
        yeni = Object.assign({ ad: $("y-il-sec").value }, bos); tur = "iller";
      } else {
        var ad = $("y-ad").value.trim();
        var m = $("y-konum").value.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
        if (!ad) return durum("Yerin adını yaz.", "hata");
        if (!m) return durum("Konumu “36.20, 29.64” gibi iki sayı olarak yaz.", "hata");
        yeni = Object.assign({ ad: ad, il: $("y-ilce-il").value, konum: [+m[1], +m[2]] }, bos); tur = "ilceler";
        if (gezi.veri.ilceler.some(function (k) { return k.ad === ad; })) return durum("Bu ad zaten var.", "hata");
        if (!gezi.veri.iller.some(function (k) { return k.ad === yeni.il; })) {
          gezi.veri.iller.push(Object.assign({ ad: yeni.il }, bos, { fotograflar: [], etiketler: [] }));
        }
      }
      gezi.veri[tur].push(yeni);
      this.disabled = true; durum("Kaydediliyor…");
      jsonKaydet("veri/gezilerim.json", gezi.veri, "Panel: yeni yer " + yeni.ad).then(function () {
        seciliYer = { tur: tur, ad: yeni.ad }; yerleriCiz(); yerDuzenCiz();
        durum(yeni.ad + " eklendi. Şimdi yazı ve fotoğraf ekleyebilirsin.", "iyi");
      }).catch(function (e) { gezi.veri[tur].pop(); durum("Eklenemedi: " + e.message, "hata"); });
    });
  });

  /* ---------- Yemeklerim / Eserlerim ---------- */
  var YEMEK = { dosya: "veri/yemeklerim.json", anahtar: "yemekler", baslik: "Yemeklerim", not: "Yaptığın yemekleri fotoğrafı ve tarifiyle ekle.",
    alanlar: [["ad", "Yemeğin adı", "text"], ["kategori", "Kategori (ör. Tatlı, Ana yemek)", "text"], ["ozet", "Kısa açıklama", "text"], ["tarif", "Tarif (isteğe bağlı)", "textarea"]] };
  var ESER = { dosya: "veri/eserlerim.json", anahtar: "eserler", baslik: "Eserlerim", not: "Yazı, resim, el işi… ne ürettiysen ekle.",
    alanlar: [["ad", "Eserin adı", "text"], ["tur", "Türü (ör. Resim, Yazı)", "text"], ["yil", "Yılı", "text"], ["ozet", "Kısa açıklama", "text"], ["baglanti", "Bağlantı (isteğe bağlı)", "text"]] };
  var aktifListe = null, listeVeri = {}, seciliKart = -1, kartBekleyen = null;

  function listeKur(L) {
    aktifListe = L; seciliKart = -1; kartBekleyen = null;
    $("liste-baslik").textContent = L.baslik; $("liste-not").textContent = L.not;
    $("kart-duzen").innerHTML = '<div class="bos">Soldan birini seç ya da yenisini ekle.</div>';
    if (listeVeri[L.dosya]) return kartlariCiz();
    $("kart-liste").innerHTML = '<div class="bos">Yükleniyor…</div>';
    dosyaOku(L.dosya).then(function (d) { listeVeri[L.dosya] = d; if (aktifListe === L) kartlariCiz(); })
      .catch(function (e) { $("kart-liste").innerHTML = '<div class="durum hata">' + esc(e.message) + "</div>"; });
  }
  function liste() { return listeVeri[aktifListe.dosya].veri[aktifListe.anahtar]; }
  function kartlariCiz() {
    $("kart-liste").innerHTML = liste().map(function (k, i) {
      return '<div class="oge' + (i === seciliKart ? " secili" : "") + '" data-i="' + i + '">' +
        (k.foto ? '<img src="../' + esc(k.foto) + '" alt="">' : '<span class="yer-tut"></span>') + "<b>" + esc(k.ad || "(adsız)") + "</b></div>";
    }).join("") || '<div class="bos">Henüz bir şey yok.</div>';
  }
  $("kart-liste").addEventListener("click", function (e) {
    var o = e.target.closest(".oge"); if (!o) return;
    seciliKart = +o.dataset.i; kartBekleyen = null; kartlariCiz(); kartDuzenCiz(); if (window.innerWidth < 820) $("kart-duzen").scrollIntoView({ behavior: "smooth" });
  });
  $("kart-yeni").addEventListener("click", function () {
    var yeni = {}; aktifListe.alanlar.forEach(function (a) { yeni[a[0]] = ""; }); yeni.foto = "";
    liste().push(yeni); seciliKart = liste().length - 1; kartBekleyen = null; kartlariCiz(); kartDuzenCiz();
  });
  function kartDuzenCiz() {
    var k = liste()[seciliKart];
    var foto = kartBekleyen ? kartBekleyen.onizleme : (k.foto ? "../" + k.foto : "");
    $("kart-duzen").innerHTML = aktifListe.alanlar.map(function (a) {
      var id = "k-" + a[0];
      return '<label for="' + id + '">' + esc(a[1]) + "</label>" + (a[2] === "textarea"
        ? '<textarea id="' + id + '">' + esc(k[a[0]]) + "</textarea>"
        : '<input id="' + id + '" type="text" value="' + esc(k[a[0]]) + '">');
    }).join("") +
      "<label>Fotoğraf</label>" +
      '<div class="foto-duzen tek-foto">' + (foto ? '<div class="f' + (kartBekleyen ? " yeni" : "") + '"><img src="' + esc(foto) + '" alt=""></div>' : "") +
      '<label class="yukle" for="k-dosya">' + (foto ? "Fotoğrafı değiştir" : "+ Fotoğraf ekle") + "</label></div>" +
      '<input id="k-dosya" type="file" accept="image/*" hidden>' +
      '<div class="satir"><button class="dugme" id="k-kaydet">Kaydet ve yayınla</button><button class="dugme tehlike" id="k-sil">Sil</button></div><div class="durum" id="durum"></div>';
  }
  function kartFormu() {
    var k = liste()[seciliKart];
    aktifListe.alanlar.forEach(function (a) { var el = $("k-" + a[0]); if (el) k[a[0]] = el.value.trim(); });
    return k;
  }
  $("kart-duzen").addEventListener("change", function (e) {
    if (e.target.id !== "k-dosya" || !e.target.files[0]) return;
    kartFormu();
    kucult(e.target.files[0]).then(function (f) { kartBekleyen = f; kartDuzenCiz(); durum("Kaydet’e basınca yüklenecek."); })
      .catch(function (err) { durum(err.message, "hata"); });
  });
  $("kart-duzen").addEventListener("click", function (e) {
    var L = aktifListe;
    if (e.target.id === "k-kaydet") {
      var k = kartFormu();
      if (!k.ad) return durum("Bir ad yaz.", "hata");
      e.target.disabled = true;
      var once = kartBekleyen ? (durum("Fotoğraf yükleniyor…"), fotoYukle(kartBekleyen, L.anahtar + "-" + k.ad).then(function (src) { k.foto = src; })) : Promise.resolve();
      once.then(function () { durum("Kaydediliyor…"); return jsonKaydet(L.dosya, listeVeri[L.dosya].veri, "Panel: " + L.baslik + " · " + k.ad); })
        .then(function () { kartBekleyen = null; kartlariCiz(); kartDuzenCiz(); durum("Kaydedildi. Sitede 1–2 dakika içinde görünecek.", "iyi"); })
        .catch(function (err) { e.target.disabled = false; durum("Kaydedilemedi: " + err.message, "hata"); });
    } else if (e.target.id === "k-sil") {
      if (!confirm("“" + (liste()[seciliKart].ad || "Bu kayıt") + "” silinsin mi?")) return;
      var silinen = liste().splice(seciliKart, 1)[0];
      e.target.disabled = true;
      jsonKaydet(L.dosya, listeVeri[L.dosya].veri, "Panel: " + L.baslik + " · " + (silinen.ad || "kayıt") + " silindi")
        .then(function () { seciliKart = -1; kartlariCiz(); $("kart-duzen").innerHTML = '<div class="bos">Silindi.</div>'; })
        .catch(function (err) { liste().splice(seciliKart, 0, silinen); e.target.disabled = false; durum("Silinemedi: " + err.message, "hata"); });
    }
  });

  /* ---------- Başlat ---------- */
  function basla() {
    sekmeAc();
    if (yuklendi) return;
    $("yerler").innerHTML = '<div class="bos">Yükleniyor…</div>';
    dosyaOku("veri/gezilerim.json").then(function (d) {
      gezi = d; yuklendi = true;
      gezi.veri.ilceler = gezi.veri.ilceler || [];
      yerleriCiz();
    }).catch(function (e) {
      if (/geçersiz|izni/.test(e.message)) {
        try { localStorage.removeItem(ANAHTAR_KEY); } catch (x) {}
        anahtar = ""; girisGoster(e.message);
      } else { $("yerler").innerHTML = '<div class="durum hata">' + esc(e.message) + "</div>"; }
    });
  }
  window.addEventListener("beforeunload", function (e) {
    if (bekleyenler.length || kartBekleyen) { e.preventDefault(); e.returnValue = ""; }
  });
  basla();
})();

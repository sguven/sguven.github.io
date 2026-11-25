# Demet Güven kişisel site (sguven.github.io/demet/)

Sekmeler: Gezdiğim Yerler, Yemeklerim, Eserlerim, Ben.

## İçerik nasıl doldurulur
- **Gezi detayları:** `veri/gezilerim.json`. Her il/ilçe için `tarih`, `ozet`, `aciklama` (paragrafları boş satırla ayırın), `fotograflar` ve `etiketler` alanları var.
  Fotoğrafları `img/` klasörüne koyup `"fotograflar": [{"src": "img/trabzon-1.jpg", "aciklama": "Uzungöl"}]` şeklinde ekleyin.
- **Yeni il:** `iller` listesine `{"ad": "Van", ...}` ekleyin (ad, haritadaki adla aynı olmalı; Afyon için "Afyonkarahisar").
- **Yeni ilçe/şehir iğnesi:** `ilceler` listesine `ad`, `il`, `konum: [enlem, boylam]` ile ekleyin.
- **Yemekler / Eserler:** `veri/yemeklerim.json`, `veri/eserlerim.json`.
- **Ben:** `index.html` içindeki `<section id="ben">` bölümü.

`js/iller.js` harita sınırlarıdır (kaynak: github.com/cihadturhan/tr-geojson), elle değiştirmeyin.

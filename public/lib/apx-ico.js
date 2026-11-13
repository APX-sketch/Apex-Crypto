/* =====================================================================
 *  Apex Coin Icon  —  أيقونة عملة ثابتة لا تختفي أبداً
 * ---------------------------------------------------------------------
 *  لماذا كانت تختفي؟ حين تفشل صورة الإنترنت أو يُعاد بناء العنصر عند كل
 *  تحديث سعر، يظهر فراغ لحظي (الإطار يبقى بدون صورة). الحل ثلاثي:
 *   1) الأيقونة دائماً <span> داخل الصورة (لا فراغ مطلقاً): تدرّج لوني
 *      ثابت مشتق من رمز العملة + أول حرف — يُرسم محلياً بلا أي طلب شبكة.
 *   2) الصورة الحقيقية تُركَّب فوقها وتبقى مخفية حتى تُحمَّل فعلاً
 *      (onload)، فما بقى فيه لحظة "فراغ" بين الحذف والإظهار.
 *   3) الرمز الذي فشلت صورته مرتين يُحفظ محلياً (localStorage) فلا يُطلب
 *      مرة أخرى أبداً — حتى بعد إعادة فتح الصفحة.
 *  الاستخدام:  APXICO.html('BTC')         → نص HTML للأيقونة
 *              APXICO.into(el, 'BTC')     → يضبط أيقونة عنصر موجود
 *              APXICO.ready(el, 'BTC')    → يضمن أن العنصر يحتوي أيقونة
 *  اختياري: <script src="apx-ico.js"></script> قبل سكربت الصفحة.
 * ===================================================================== */
(function (root) {
  'use strict';
  var LS_KEY = 'apex_ico_bad_v2';
  var BAD = {};
  try { BAD = JSON.parse(root.localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { BAD = {}; }

  var GOOD = {};
  var MEM = {};                 // رمز -> نص HTML جاهز


  /* ===== أيقونات مدمجة (لا شبكة إطلاقاً) لرموز المنصّة الخاصة =====
     هذه الرموز غير موجودة في أي مصدر عالمي، فكانت تُطلب وتفشل دورياً
     فيظهر الحرف ثم تعود الصورة. الآن صورة ثابتة مرسومة داخل الملف. */
  var EMBED = {
    USD1: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22#2775CA%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22#1B4F8F%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2250%22%20fill%3D%22url(%23g)%22/%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2244%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22central%22%3E%241%3C/text%3E%3C/svg%3E',
    NVDAB: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22#76B900%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22#4A7A00%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2250%22%20fill%3D%22url(%23g)%22/%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2250%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22central%22%3EN%3C/text%3E%3C/svg%3E',
    APX: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22#F0B90B%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22#B8860B%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2250%22%20fill%3D%22url(%23g)%22/%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%2CHelvetica%2Csans-serif%22%20font-size%3D%2252%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22central%22%3EA%3C/text%3E%3C/svg%3E'
  };

  var CDN = 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/';
  var ALT = 'https://assets.coincap.io/assets/icons/';

  function norm(b) {
    return String(b == null ? '' : b).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  /* لون ثابت لكل رمز — نفس الرمز يعطي نفس اللون دائماً */
  function hue(b) {
    var h = 0;
    for (var i = 0; i < b.length; i++) { h = (h * 31 + b.charCodeAt(i)) >>> 0; }
    return h % 360;
  }

  function fallback(b, size) {
    var s = size || 30;
    var h1 = hue(b), h2 = (h1 + 42) % 360;
    var ch = b.slice(0, 1) || '?';
    return '<span class="ax-ico" style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;flex:0 0 auto;' +
      'font-weight:900;font-size:' + Math.round(s * 0.44) + 'px;color:#fff;' +
      'letter-spacing:.5px;user-select:none;' +
      'background:linear-gradient(135deg,hsl(' + h1 + ',58%,42%),hsl(' + h2 + ',66%,30%));' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);">' + ch + '</span>';
  }

  /* =====================================================================
   *  لماذا كانت الصورة "تختفي وتعود" كل كم ثانية؟
   *  لأن كل <img> كان يطلب الملف من الشبكة عند كل بناء للصفحة، وأي بطء
   *  أو انقطاع لحظي يطلق onerror → يظهر الحرف، ثم بعد ثوانٍ ينجح الطلب
   *  فتعود الصورة. الحل هنا:
   *   1) صورة محفوظة دائماً: أول تحميل ناجح يُخزَّن في localStorage
   *      ويُستخدم بعدها إلى الأبد بلا أي طلب شبكة → لا يمكن أن "تضيع".
   *   2) الشكل الثابت يُرسم قبل الصورة (دائرة/حرف أو أيقونة مدمجة)
   *      فما في أبداً لحظة فراغ.
   *   3) الفشل لا يمسح صورة ناجحة سابقاً.
   * ===================================================================== */
  var CACHE_KEY = 'apex_ico_cache_v3';
  var CACHE = {};
  try { CACHE = JSON.parse(root.localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { CACHE = {}; }

  function saveCache() {
    try {
      var keys = Object.keys(CACHE);
      // خطة مجانية: نحدّ العدد حتى لا يتضخم تخزين المتصفح
      if (keys.length > 120) { var drop = keys.slice(0, keys.length - 120); for (var i = 0; i < drop.length; i++) delete CACHE[drop[i]]; }
      root.localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE));
    } catch (e) {}
  }

  /* الأيقونة الثابتة (تُرسم فوراً): مدمجة للرموز الخاصة، أو دائرة الحرف */
  function staticLayer(sym, s) {
    if (EMBED[sym]) {
      return '<img class="ax-emb" alt="" src="' + EMBED[sym] + '" ' +
        'style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;display:block">';
    }
    return fallback(sym, s);
  }

  function wrap(sym, s, inner) {
    return '<span class="ax-wrap" data-sym="' + sym + '" ' +
      'style="position:relative;width:' + s + 'px;height:' + s + 'px;flex:0 0 auto;display:inline-block;vertical-align:middle">' +
      inner + '</span>';
  }

  /* نص HTML للأيقونة */
  function html(b, size) {
    var sym = norm(b);
    var s = size || 30;
    var key = sym + '|' + s;
    if (MEM[key]) return MEM[key];

    var out;
    if (!sym) {
      out = fallback(sym, s);
    } else if (BAD[sym]) {
      /* فشل مؤكد سابقاً: شكل ثابت فقط، بلا أي طلب شبكة مرة أخرى */
      out = wrap(sym, s, staticLayer(sym, s));
    } else if (EMBED[sym]) {
      /* رمز خاص: صورة مدمجة ثابتة 100% — لا شبكة ولا حرف متذبذب */
      out = wrap(sym, s, staticLayer(sym, s));
    } else {
      var cached = CACHE[sym];
      var src = cached ? cached : (CDN + sym.toLowerCase() + '.png');
      var cls = 'ax-img' + (cached ? ' ax-saved' : '');
      var op = cached ? '1' : '0';
      out = wrap(sym, s,
        '<span class="ax-bg" style="position:absolute;inset:0;border-radius:50%;overflow:hidden;opacity:' +
          (cached ? '0' : '1') + '">' + staticLayer(sym, s) + '</span>' +
        '<img class="' + cls + '" alt="" data-sym="' + sym + '" src="' + src + '" ' +
          'decoding="async" fetchpriority="high" ' +
          'style="position:absolute;inset:0;width:' + s + 'px;height:' + s + 'px;border-radius:50%;' +
          'object-fit:cover;opacity:' + op + ';transition:opacity .12s linear" ' +
          'onload="window.APXICO&&APXICO._ok(this)" ' +
          'onerror="window.APXICO&&APXICO._err(this)">');
    }
    MEM[key] = out;
    return out;
  }

  function _ok(img) {
    var sym = img.getAttribute('data-sym') || '';
    GOOD[sym] = 1;
    img.style.opacity = '1';
    var bg = img.previousElementSibling;
    if (bg) bg.style.opacity = '0';
    var w = img.parentNode;
    if (w) w.dataset.state = 'img';
    /* حفظ الصورة محلياً: بعد أول نجاح لا طلب شبكة أبداً */
    if (sym && !CACHE[sym] && !img.classList.contains('ax-saved')) {
      try {
        CACHE[sym] = img.currentSrc || img.src;
        img.classList.add('ax-saved');
        saveCache();
      } catch (e) {}
    }
  }

  function _err(img) {
    var sym = img.getAttribute('data-sym') || '';
    /* صورة ناجحة سابقاً: لا نتراجع عنها مهما حصل (تحديث فاشل لا يمسح الأيقونة) */
    if (img.classList.contains('ax-saved') || CACHE[sym]) { return; }
    if (!img.dataset.alt) {
      img.dataset.alt = '1';
      img.src = ALT + String(sym).toLowerCase() + '@2x.png';
      return;
    }
    /* بس بعد فشل المصدرين: نثبّت الشكل النصي ونوقف المحاولات لهذا الرمز */
    BAD[sym] = 1;
    MEM = {};
    try { root.localStorage.setItem(LS_KEY, JSON.stringify(BAD)); } catch (e) {}
    var bg = img.previousElementSibling;
    if (bg) bg.style.opacity = '1';
    img.style.display = 'none';
    var w = img.parentNode;
    if (w) w.dataset.state = 'fallback';
  }

  /* يضمن أن عنصراً موجوداً يعرض أيقونة الرمز (بلا إعادة بناء ما هو سليم) */
  function into(el, b, size) {
    if (!el) return;
    var sym = norm(b);
    if (el.dataset && el.dataset.ico === sym && el.querySelector('.ax-wrap,.ax-ico')) return;
    el.innerHTML = html(sym, size);
    if (el.dataset) el.dataset.ico = sym;
  }

  root.APXICO = {
    html: html, into: into, ready: into,
    fallback: fallback,
    isBad: function (b) { return !!BAD[norm(b)]; },
    hasIcon: function (b) { var k = norm(b); return !!(CACHE[k] || EMBED[k]); },
    markBad: function (b) { BAD[norm(b)] = 1; MEM = {}; try { root.localStorage.setItem(LS_KEY, JSON.stringify(BAD)); } catch (e) {} },
    _ok: _ok, _err: _err
  };
})(typeof window !== 'undefined' ? window : this);

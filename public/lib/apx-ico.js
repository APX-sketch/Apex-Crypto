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

  /* نص HTML للأيقونة: دائرة الحرف مطموسة (opacity:0) والصورة فوقها.
     عند نجاح التحميل تُظهر الصورة نفسها فيبقى الشكل مستقراً بلا وميض. */
  function html(b, size) {
    var sym = norm(b);
    var s = size || 30;
    if (MEM[sym + '|' + s]) return MEM[sym + '|' + s];
    var out;
    if (!sym || BAD[sym]) {
      out = fallback(sym, s);
    } else {
      out =
        '<span class="ax-wrap" style="position:relative;width:' + s + 'px;height:' + s + 'px;flex:0 0 auto;display:inline-block;vertical-align:middle">' +
          '<span class="ax-bg" style="position:absolute;inset:0;border-radius:50%;overflow:hidden;opacity:1">' + fallback(sym, s) + '</span>' +
          '<img class="ax-img" alt="" data-sym="' + sym + '" src="' + CDN + sym.toLowerCase() + '.png" ' +
            'loading="eager" decoding="async" ' +
            'style="position:absolute;inset:0;width:' + s + 'px;height:' + s + 'px;border-radius:50%;' +
            'object-fit:cover;opacity:0;transition:opacity .18s linear" ' +
            'onload="window.APXICO&&APXICO._ok(this)" ' +
            'onerror="window.APXICO&&APXICO._err(this)">' +
        '</span>';
    }
    MEM[sym + '|' + s] = out;
    return out;
  }

  function _ok(img) {
    var sym = img.getAttribute('data-sym') || '';
    GOOD[sym] = 1;
    img.style.opacity = '1';
    var bg = img.previousElementSibling;
    if (bg) bg.style.opacity = '0';
    var wrap = img.parentNode;
    if (wrap) { wrap.dataset.state = 'img'; }
  }

  function _err(img) {
    var sym = img.getAttribute('data-sym') || '';
    if (!img.dataset.alt) {
      img.dataset.alt = '1';
      img.src = ALT + String(sym).toLowerCase() + '@2x.png';
      return;
    }
    BAD[sym] = 1;
    MEM = {};
    try { root.localStorage.setItem(LS_KEY, JSON.stringify(BAD)); } catch (e) {}
    var bg = img.previousElementSibling;
    if (bg) bg.style.opacity = '1';
    img.style.display = 'none';
    var wrap = img.parentNode;
    if (wrap) { wrap.dataset.state = 'fallback'; }
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
    markBad: function (b) { BAD[norm(b)] = 1; MEM = {}; try { root.localStorage.setItem(LS_KEY, JSON.stringify(BAD)); } catch (e) {} },
    _ok: _ok, _err: _err
  };
})(typeof window !== 'undefined' ? window : this);

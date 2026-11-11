/*
 * api-config.js — إدارة مركزية لعنوان الخادم + تبديل تلقائي (Failover).
 *
 * يلفّ fetch و WebSocket عالمياً، فتُحوّل كل طلبات /api تلقائياً
 * إلى الخادم الاحتياطي عند تعطّل الأساسي (خطأ شبكة أو 502/503/504).
 * يشمل كل الصفحات بمجرّد تضمينه في <head> قبل باقي السكربتات.
 *
 * لا يمسّ الروابط الخارجية (مثل api.binance.com) — تمرّ كما هي.
 */
(function(){
  'use strict';
  if (window.__APEX_FAILOVER__) return;          // لا تُركّب مرتين
  window.__APEX_FAILOVER__ = true;

  // ===== الخادمان =====
  // مهمّ: تمّ توحيد الخادمين على خادم واحد (apex-crypto-1).
  // السبب: وجود خادمين على نفس قاعدة البيانات كان يُسبّب split-brain؛
  // فحص الصحة هنا كان يُوقِظ الخادم الآخر النائم فيطمس البيانات.
  // بتوجيه الاثنين إلى apex-crypto-1 لن تُوقِظ الصفحة الخادم الآخر أبداً.
  var PRIMARY = 'https://apex-crypto-1.onrender.com';     // الخادم الوحيد (الكاتب)
  var BACKUP  = 'https://apex-crypto-1.onrender.com';     // نفسه (لا خادم ثانٍ)
  var HERE    = location.origin;                          // الخادم الذي قدّم الصفحة
  var KNOWN   = [PRIMARY, BACKUP, HERE];
  var KEY     = 'apex_api_base';
  var HEALTH_TIMEOUT = 4500;                              // فحص صحة سريع ~4.5ث

  var _fetch = window.fetch ? window.fetch.bind(window) : null;

  function store(v){ try{ localStorage.setItem(KEY, v); }catch(e){} }
  function stored(){ try{ return localStorage.getItem(KEY) || ''; }catch(e){ return ''; } }

  // الخادم النشط (دائماً PRIMARY أو BACKUP). نفضّل خادم الصفحة الحاليّ
  // لأنّه أكيد الوصول (هو من قدّم هذه الصفحة)، ثمّ المخزّن، ثمّ الأساسي.
  var base;
  var st = stored();
  if (HERE === PRIMARY || HERE === BACKUP) base = HERE;
  else if (st === PRIMARY || st === BACKUP) base = st;
  else base = PRIMARY;

  function setBase(v){ base = v; store(v); try{ window.dispatchEvent(new Event('apex:base')); }catch(e){} }
  function other(b){ return b === BACKUP ? PRIMARY : BACKUP; }

  // واجهة بسيطة لبقية الكود إن احتاجت معرفة الخادم الحالي.
  window.APEX = window.APEX || {};
  window.APEX.PRIMARY = PRIMARY;
  window.APEX.BACKUP  = BACKUP;
  window.APEX.base    = function(){ return base; };
  window.APEX.apiBase = function(){ return (base === HERE) ? '' : base; };

  // ===== أدوات الروابط =====
  function urlOf(input){ return (typeof input === 'string') ? input : (input && input.url) || ''; }
  function isApp(u){
    if (!u) return false;
    if (/^https?:\/\//i.test(u)){
      for (var i=0;i<KNOWN.length;i++){ if (u.indexOf(KNOWN[i]) === 0) return true; }
      return false;                    // رابط خارجي → لا يُمَسّ
    }
    return u.charAt(0) === '/';        // مسار نسبي من جذر الموقع
  }
  // أعد بناء الرابط على خادم معيّن.
  function rebuild(b, u){
    if (/^https?:\/\//i.test(u)){
      for (var i=0;i<KNOWN.length;i++){ if (u.indexOf(KNOWN[i]) === 0) return b + u.slice(KNOWN[i].length); }
      return u;
    }
    return (b === HERE) ? u : (b + u);  // نفس الأصل → اتركه نسبياً (بلا CORS)
  }
  function retriable(res){ return res && (res.status === 502 || res.status === 503 || res.status === 504); }
  function doFetch(b, input, init){
    var target = rebuild(b, urlOf(input));
    if (typeof input === 'string') return _fetch(target, init);
    return _fetch(new Request(target, input), init);   // دعم Request احتياطياً
  }

  // ===== لفّ fetch =====
  if (_fetch){
    window.fetch = function(input, init){
      var u = urlOf(input);
      if (!isApp(u)) return _fetch(input, init);         // خارجي → مرّره
      return doFetch(base, input, init).then(function(res){
        if (!retriable(res)) return res;
        return tryOther(input, init, res);
      }).catch(function(err){
        return tryOther(input, init, null).catch(function(){ throw err; });
      });
    };
  }
  function tryOther(input, init, prevRes){
    var ob = other(base);
    return doFetch(ob, input, init).then(function(res){
      if (!retriable(res)){ setBase(ob); return res; }   // البديل يعمل → ثبّته
      return prevRes || res;
    });
  }

  // ===== لفّ WebSocket (تبديل المضيف إن كان أحد خادمينا) =====
  if (window.WebSocket){
    var WS = window.WebSocket;
    var wsHost = function(h){ return h.replace(/^http/i, 'ws'); };
    var W = function(url, protocols){
      try{
        var s = String(url);
        for (var i=0;i<KNOWN.length;i++){
          var k = wsHost(KNOWN[i]);
          if (s.indexOf(k) === 0){ s = wsHost(base) + s.slice(k.length); break; }
        }
        url = s;
      }catch(e){}
      return protocols === undefined ? new WS(url) : new WS(url, protocols);
    };
    W.prototype = WS.prototype;
    W.CONNECTING = WS.CONNECTING; W.OPEN = WS.OPEN; W.CLOSING = WS.CLOSING; W.CLOSED = WS.CLOSED;
    try{ window.WebSocket = W; }catch(e){}
  }

  // ===== فحص الصحة عند الإقلاع =====
  function health(b){
    if (!_fetch) return Promise.resolve(false);
    return new Promise(function(resolve){
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var t = setTimeout(function(){ if (ctl) ctl.abort(); resolve(false); }, HEALTH_TIMEOUT);
      _fetch(rebuild(b, '/api/health'), { method:'GET', cache:'no-store', signal: ctl ? ctl.signal : undefined })
        .then(function(r){ clearTimeout(t); resolve(!!(r && r.ok)); })
        .catch(function(){ clearTimeout(t); resolve(false); });
    });
  }
  health(base).then(function(ok){
    if (ok){ store(base); return; }       // الحالي سليم
    var ob = other(base);
    health(ob).then(function(ok2){ if (ok2) setBase(ob); });  // انتقل للبديل إن كان سليماً
  });
})();

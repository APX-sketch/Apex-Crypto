/* ============================================================
   Apex Platform Coin (APX) — client module
   عملة المنصّة APX. الأولوية للسيرفر (قاعدة بيانات مركزية)
   فيضبط الأدمن السعر مرة واحدة ويظهر لكل المستخدمين على كل الأجهزة.
   إذا لم يكن مخزن السيرفر مركّباً بعد → يرجع localStorage تلقائياً.
   ============================================================ */
(function(){
  var KEY='apex_apx';
  var SYM='APXUSDT', BASE='APX', NAME='Apex Coin';
  var DEF={price:1.00, chg:0.00, vol:1850000, supply:100000000, enabled:true};
  var API=(window.API_BASE||'');
  var serverOk=false;      // هل مخزن السيرفر متاح؟
  var _hist=null;          // تاريخ السعر من السيرفر

  function _email(){try{var s=JSON.parse(localStorage.getItem('skygo_session')||'{}');return String(s.email||'guest').toLowerCase();}catch(e){return 'guest';}}
  function _token(){try{var s=JSON.parse(localStorage.getItem('skygo_session')||'{}');return s.token||localStorage.getItem('apex_token')||'';}catch(e){return localStorage.getItem('apex_token')||'';}}

  /* ---- الإعدادات المخزّنة محلياً (مرآة لـ السيرفر) ---- */
  function _norm(o){
    o=o||{};var r={};for(var k in DEF)r[k]=DEF[k];for(var k2 in o)r[k2]=o[k2];
    r.price=+r.price;if(!(r.price>0))r.price=DEF.price;
    r.chg=+r.chg;if(!isFinite(r.chg))r.chg=0;
    r.vol=+r.vol;if(!(r.vol>=0))r.vol=DEF.vol;
    r.supply=+r.supply;if(!(r.supply>=0))r.supply=DEF.supply;
    r.enabled=(r.enabled!==false);
    return r;
  }
  function cfg(){
    var s=null;try{s=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
    return _norm(s||{});
  }
  /* كتابة محلية + إشعار الصفحات المفتوحة */
  function _writeLocal(c){
    try{localStorage.setItem(KEY,JSON.stringify(c));}catch(e){}
    try{window.dispatchEvent(new CustomEvent('apx:change',{detail:c}));}catch(e){}
  }
  /* حفظ محلي فقط (صدى سريع)؛ الحفظ الرسمي للأدمن يتم عبر saveRemote */
  function save(patch){var c=_norm(Object.assign({},cfg(),patch||{}));_writeLocal(c);return c;}

  /* ---- مزامنة مع السيرفر ---- */
  function pull(){
    return fetch(API+'/api/apx',{headers:{'Accept':'application/json'}})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){serverOk=true;var c=_norm(d);var old=localStorage.getItem(KEY);var nw=JSON.stringify(c);if(old!==nw)_writeLocal(c);return c;})
      .catch(function(){serverOk=false;return cfg();});
  }
  /* حفظ رسمي على السيرفر (يستخدمه الأدمن مع التوكن) */
  function saveRemote(patch,token){
    var c=_norm(Object.assign({},cfg(),patch||{}));
    return fetch(API+'/api/admin/apx',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(token||'')},body:JSON.stringify(patch||{})})
      .then(function(r){if(!r.ok)throw new Error('server');return r.json();})
      .then(function(res){var cc=_norm(res&&res.config?res.config:c);_writeLocal(cc);return cc;})
      .catch(function(e){_writeLocal(c);throw e;});
  }
  /* تاريخ السعر من السيرفر (مع fallback محلي مولّد) */
  function history(limit){
    limit=limit||500;
    return fetch(API+'/api/apx/history?limit='+limit,{headers:{'Accept':'application/json'}})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(a){if(!Array.isArray(a)||!a.length)throw 0;_hist=a;return a;})
      .catch(function(){return _localHistory(limit);});
  }
  function _localHistory(limit){
    var c=cfg();var now=Date.now();var n=Math.min(limit,96);var out=[];var prev=c.price*(1-c.chg/100);
    for(var i=0;i<n;i++){var frac=i/((n-1)||1);var p=prev+(c.price-prev)*frac;p*=(1+Math.sin((now/1800000-n+i)/3)*0.0015);out.push({t:now-(n-1-i)*1800000,price:+p.toFixed(6)});}
    return out;
  }
  /* إشعار الأدمن بأمر شراء (السيرفر يقرر إن كان “كبيراً”) */
  function notify(o){
    try{
      var tk=_token(); if(!tk)return Promise.resolve();
      return fetch(API+'/api/apx/notify',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},body:JSON.stringify({side:o.side,qty:o.qty,price:o.price,value:o.value})}).catch(function(){});
    }catch(e){return Promise.resolve();}
  }

  /* ---- السعر والحركة من السيرفر (قاعدة مركزية) فيراها كل الحسابات نفسها + محفوظة ---- */
  function _rnd(n){var x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
  function live(){var p=cfg().price;return p>0?p:1;}
  function chgNow(){var v=cfg().chg;return isFinite(v)?v:0;}

  /* ---- رصيد APX لكل حساب — مرجعي على السيرفر (فيظهر بلوحة الأدمن) + نسخة محلية للعرض الفوري ---- */
  function hkey(){return 'apex_apx_hold_'+_email();}
  var _hold=(function(){var v=parseFloat(localStorage.getItem(hkey()));return isFinite(v)&&v>0?v:0;})();
  function _setHoldCache(v){_hold=(+v>0?+v:0);try{localStorage.setItem(hkey(),String(_hold));}catch(e){}}
  function _pullHold(){
    var tk=_token(); if(!tk)return Promise.resolve(_hold);
    return fetch(API+'/api/apx/holding',{headers:{'Authorization':'Bearer '+tk,'Accept':'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){if(d&&isFinite(+d.qty))_setHoldCache(+d.qty);return _hold;})
      .catch(function(){return _hold;});
  }
  function hold(){return _hold>0?_hold:0;}
  /* تحديث محلي فوري (تفاؤلي)؛ السيرفر هو المرجع ويوازن عبر الصفقات/السحب */
  function setHold(v){_setHoldCache(v);}
  /* سجل عمليات APX للمستخدم الحالي (Order History) */
  function orders(limit){
    var tk=_token(); if(!tk)return Promise.resolve([]);
    return fetch(API+'/api/apx/orders?limit='+(limit||100),{headers:{'Authorization':'Bearer '+tk,'Accept':'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(a){return Array.isArray(a)?a:[];})
      .catch(function(){return [];});
  }

  /* ---- بيانات سوق مولّدة (شموع/تيكر/عمق) ---- */
  var IVMS={'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'6h':21600,'8h':28800,'12h':43200,'1d':86400};
  /* ---- شموع APX من السيرفر (مشتركة لكل الحسابات + محفوظة؛ تُجلب وتُخزّن محلياً للعرض الفوري) ---- */
  var _klCache={};   // interval -> {bars,t,pending}
  function _klFetch(interval){
    var ent=_klCache[interval]||(_klCache[interval]={bars:null,t:0,pending:false});
    var now=Date.now();
    if(ent.pending)return;
    if(ent.bars&&(now-ent.t)<900)return;
    ent.pending=true;
    fetch(API+'/api/apx/klines?interval='+interval+'&limit=1000',{headers:{'Accept':'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(a){if(Array.isArray(a)&&a.length){ent.bars=a;ent.t=Date.now();}})
      .catch(function(){})
      .then(function(){ent.pending=false;});
  }
  function _seedLocal(interval,limit){
    var sec=IVMS[interval]||900;limit=limit||300;
    var c=cfg();var right=live();var ch=chgNow();
    var openRef=right/(1+ch/100);if(!(openRef>0))openRef=right;
    var now=Math.floor(Date.now()/1000);var start=now-(now%sec)-(limit-1)*sec;
    var amp=right*0.004;var out=[];var prevC=openRef;
    for(var i=0;i<limit;i++){var ot=start+i*sec;var frac=i/((limit-1)||1);
      var mid=openRef+(right-openRef)*frac;var cl=mid+(_rnd(ot)-0.5)*amp*2;if(i===limit-1)cl=right;
      var o=prevC;var hi=Math.max(o,cl)+_rnd(ot+7)*amp;var lo=Math.min(o,cl)-_rnd(ot+13)*amp;if(!(lo>0))lo=Math.min(o,cl)*0.999;
      var vol=(c.vol/limit)*(0.5+_rnd(ot+21)*1.2);
      out.push([ot*1000,+o.toFixed(6),+hi.toFixed(6),+lo.toFixed(6),+cl.toFixed(6),+vol.toFixed(2),ot*1000+sec*1000-1,+(vol*mid).toFixed(2)]);
      prevC=cl;
    }
    return out;
  }
  function klines(interval,limit){
    limit=limit||300;
    _klFetch(interval);
    var ent=_klCache[interval];
    if(ent&&ent.bars&&ent.bars.length){return ent.bars.slice(-limit).map(function(b){return b.slice();});}
    return _seedLocal(interval,limit);   // عرض مؤقت لحين وصول شموع السيرفر
  }
  /* هل وصلت شموع السيرفر الحقيقية لهذا الفريم؟ (غير البذرة المحلية) */
  function klinesReady(interval){var e=_klCache[interval];return !!(e&&e.bars&&e.bars.length);}
  function ticker(){
    var c=cfg();var p=live();var ch=chgNow();var a=Math.abs(ch)/100;
    return {symbol:SYM, lastPrice:p, priceChangePercent:ch,
      highPrice:p*(1+a*0.6+0.0035), lowPrice:p*(1-a*0.6-0.0035),
      quoteVolume:c.vol, volume:c.vol/(p||1)};
  }
  function depth(limit){
    limit=limit||12;var p=live();var bids=[],asks=[];
    for(var i=1;i<=limit;i++){
      var gap=p*0.0004*i;
      bids.push([+(p-gap).toFixed(6), +(Math.random()*4000+500).toFixed(2)]);
      asks.push([+(p+gap).toFixed(6), +(Math.random()*4000+500).toFixed(2)]);
    }
    return {bids:bids, asks:asks, lastUpdateId:Date.now()};
  }

  /* ---- الاشتراك بتغيّر الإعدادات (لإعادة رسم الصفحات فوراً) ---- */
  function onChange(fn){
    if(typeof fn!=='function')return;
    window.addEventListener('apx:change',function(e){try{fn(e.detail||cfg());}catch(x){}});
    window.addEventListener('storage',function(e){if(e.key===KEY){try{fn(cfg());}catch(x){}}});
  }

  /* ---- تنفيذ صفقة بتأثير سوقي (شراء يرفع / بيع ينزّل) ---- */
  function trade(o){
    o=o||{};
    var side=String(o.side||'buy').toLowerCase();
    var value=Math.abs(parseFloat(o.value)||0);
    var qty=Math.abs(parseFloat(o.qty)||0);
    // لا تأثير على السعر من الصفقات — السعر يتحكم به الأدمن فقط
    var tk=_token();
    return fetch(API+'/api/apx/trade',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tk},body:JSON.stringify({side:side,qty:qty,value:value})})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(res){if(res){if(res.config)_writeLocal(_norm(res.config));if(isFinite(+res.holding))_setHoldCache(+res.holding);}return res;})
      .catch(function(){return null;});
  }

  window.APX={
    KEY:KEY, SYM:SYM, BASE:BASE, NAME:NAME,
    is:function(s){return String(s||'').toUpperCase()===SYM;},
    cfg:cfg, save:save, saveRemote:saveRemote, pull:pull, history:history, notify:notify, trade:trade,
    live:live, hold:hold, setHold:setHold, orders:orders, pullHold:_pullHold,
    klines:klines, klinesReady:klinesReady, ticker:ticker, depth:depth,
    onChange:onChange, serverReady:function(){return serverOk;}
  };

  /* مزامنة أولية + سعر حيّ من السيرفر كل ثانية (نفس القيمة لكل الحسابات) + رصيد المستخدم */
  pull();
  _pullHold();
  setInterval(pull, 3000);
  setInterval(_pullHold, 4000);
})();

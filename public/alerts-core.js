/* Apex — محرّك التنبيهات السعرية المشترك (يُحمّل في كل الصفحات) */
(function(){
  var ICON = 'icon.svg';
  // تسجيل الـ Service Worker
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(function(reg){
      // محاولة تفعيل المزامنة الدورية (best-effort)
      if('periodicSync' in reg){ reg.periodicSync.register('apex-price-alerts',{minInterval:15*60*1000}).catch(function(){}); }
    }).catch(function(){});
  }
  function loadAlerts(){ try{ return JSON.parse(localStorage.getItem('skygo_alerts')||'[]'); }catch(e){ return []; } }
  function saveAlerts(a){ localStorage.setItem('skygo_alerts', JSON.stringify(a)); }
  function soundOn(){ return localStorage.getItem('apex_alert_sound') !== '0'; }
  function pdec(p){ return p>=1000?2:p>=1?2:p>=0.1?4:6; }
  function fmt(n,d){ return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
  var priceMap = {}, actx = null;

  function ensureCtx(){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch(e){} return actx; }
  function tone(freq, start, dur){
    try{
      var o=actx.createOscillator(), g=actx.createGain();
      o.connect(g); g.connect(actx.destination); o.type='sine'; o.frequency.value=freq;
      var t=actx.currentTime+start;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.35,t+0.03);
      g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      o.start(t); o.stop(t+dur+0.02);
    }catch(e){}
  }
  function beep(){ if(!soundOn()) return; if(!ensureCtx()) return; tone(880,0,0.35); tone(1175,0.28,0.4); tone(1568,0.56,0.45); }

  function notify(title, body, tag, url){
    if('serviceWorker' in navigator && navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({type:'notify',title:title,body:body,tag:tag,icon:ICON,url:url});
    } else if('serviceWorker' in navigator && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(function(reg){ try{ reg.showNotification(title,{body:body,tag:tag,renotify:true,requireInteraction:true,vibrate:[200,100,200],icon:ICON,data:{url:url}}); }catch(e){} });
    } else if('Notification' in window && Notification.permission==='granted'){
      try{ new Notification(title,{body:body,tag:tag,icon:ICON}); }catch(e){}
    }
  }

  async function fetchBatch(syms){
    try{
      var r=await fetch('https://api.binance.com/api/v3/ticker/price?symbols='+encodeURIComponent(JSON.stringify(syms)));
      if(!r.ok) throw 0; var arr=await r.json(); if(!Array.isArray(arr)) throw 0;
      arr.forEach(function(d){ priceMap[d.symbol]=parseFloat(d.price); });
    }catch(e){
      var res=await Promise.allSettled(syms.map(function(s){ return fetch('https://api.binance.com/api/v3/ticker/price?symbol='+s).then(function(x){return x.ok?x.json():null;}); }));
      res.forEach(function(r){ if(r.status==='fulfilled'&&r.value&&r.value.symbol) priceMap[r.value.symbol]=parseFloat(r.value.price); });
    }
  }

  async function tick(){
    var a=loadAlerts();
    var active=a.filter(function(x){ return x.active; });
    if(!active.length) return;
    var set={}; active.forEach(function(x){ set[x.coin]=1; });
    var syms=Object.keys(set).map(function(b){ return b+'USDT'; });
    await fetchBatch(syms);
    var changed=false;
    a.forEach(function(x){
      if(!x.active) return;
      var p=priceMap[x.coin+'USDT']; if(!p) return;
      if((x.cond==='above'&&p>=x.target)||(x.cond==='below'&&p<=x.target)){
        x.active=false; x.triggered=Date.now(); x.triggerPrice=p; changed=true;
        var dir = x.cond==='above' ? 'صعد إلى أو تجاوز' : 'نزل إلى أو تحت';
        var msg = x.coin+' '+dir+' $'+fmt(x.target,pdec(x.target))+' — السعر الآن $'+fmt(p,pdec(p));
        notify('🔔 Apex — تنبيه سعري', msg, 'apex-al-'+x.id, 'alerts.html');
        beep();
      }
    });
    if(changed){ saveAlerts(a); try{ window.dispatchEvent(new Event('apex-alerts-updated')); }catch(e){} }
  }

  // تفعيل الصوت بعد أول تفاعل من المستخدم (متطلب المتصفحات)
  function unlockAudio(){ ensureCtx(); window.removeEventListener('pointerdown',unlockAudio); window.removeEventListener('touchstart',unlockAudio); }
  window.addEventListener('pointerdown',unlockAudio,{once:false});
  window.addEventListener('touchstart',unlockAudio,{once:false});

  setInterval(tick, 5000); tick();

  window.ApexAlerts = {
    beep: beep,
    testSound: function(){ ensureCtx(); beep(); },
    setSound: function(on){ localStorage.setItem('apex_alert_sound', on?'1':'0'); },
    soundOn: soundOn,
    askPermission: function(){
      if('Notification' in window && Notification.permission==='default'){ return Notification.requestPermission(); }
      return Promise.resolve(('Notification' in window)?Notification.permission:'denied');
    }
  };
})();

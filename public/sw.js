/* Apex Service Worker — إشعارات النظام للتنبيهات السعرية */
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

// الصفحات ترسل طلب الإشعار للـ SW ليظهر كإشعار نظام على الجهاز
self.addEventListener('message', function(e){
  var d = e.data || {};
  if(d.type === 'notify'){
    self.registration.showNotification(d.title || 'Apex', {
      body: d.body || '',
      tag: d.tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [200,100,200,100,200],
      icon: d.icon,
      badge: d.icon,
      data: { url: d.url || 'alerts.html' }
    });
  }
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || 'alerts.html';
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(cs){
    for(var i=0;i<cs.length;i++){ if('focus' in cs[i]){ cs[i].focus(); try{ cs[i].navigate(url); }catch(_){}; return; } }
    if(clients.openWindow) return clients.openWindow(url);
  }));
});

// مزامنة دورية في الخلفية (تعمل فقط عند تثبيت التطبيق كـ PWA ومنح الإذن)
self.addEventListener('periodicsync', function(e){
  if(e.tag === 'apex-price-alerts'){ e.waitUntil(bgCheck()); }
});
async function bgCheck(){
  // لا يمكن قراءة localStorage من الـ SW؛ نبقي هذا احتياطياً؋ والفحص الفعلي يتم من الصفحة طالما أي تبويب مفتوح.
  return;
}

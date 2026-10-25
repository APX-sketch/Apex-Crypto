/* ===================================================================
   Apex — محرّك اللغات (i18n) + تبديل المظهر (فاتح/داكن)
   — مشترك بين كل الصفحات. يترجم المفاتيح (data-i18n)
     وكذلك أي نص عربي مكتوب مباشرة عبر قاموس المصدر.
=================================================================== */
(function(){
'use strict';
var LKEY='apex_lang', TKEY='apex_theme';
var AR=/[\u0600-\u06FF]/;
var LANGS=[
  {c:'ar',n:'العربية',e:'Arabic',f:'\uD83C\uDDF8\uD83C\uDDE6',dir:'rtl'},
  {c:'en',n:'English',e:'English',f:'\uD83C\uDDEC\uD83C\uDDE7',dir:'ltr'},
  {c:'fr',n:'Français',e:'French',f:'\uD83C\uDDEB\uD83C\uDDF7',dir:'ltr'},
  {c:'es',n:'Español',e:'Spanish',f:'\uD83C\uDDEA\uD83C\uDDF8',dir:'ltr'},
  {c:'de',n:'Deutsch',e:'German',f:'\uD83C\uDDE9\uD83C\uDDEA',dir:'ltr'},
  {c:'tr',n:'Türkçe',e:'Turkish',f:'\uD83C\uDDF9\uD83C\uDDF7',dir:'ltr'},
  {c:'ru',n:'Русский',e:'Russian',f:'\uD83C\uDDF7\uD83C\uDDFA',dir:'ltr'},
  {c:'zh',n:'中文',e:'Chinese',f:'\uD83C\uDDE8\uD83C\uDDF3',dir:'ltr'},
  {c:'hi',n:'हिन्दी',e:'Hindi',f:'\uD83C\uDDEE\uD83C\uDDF3',dir:'ltr'},
  {c:'ur',n:'اردو',e:'Urdu',f:'\uD83C\uDDF5\uD83C\uDDF0',dir:'rtl'},
  {c:'pt',n:'Português',e:'Portuguese',f:'\uD83C\uDDF5\uD83C\uDDF9',dir:'ltr'},
  {c:'id',n:'Indonesia',e:'Indonesian',f:'\uD83C\uDDEE\uD83C\uDDE9',dir:'ltr'},
  {c:'ja',n:'日本語',e:'Japanese',f:'\uD83C\uDDEF\uD83C\uDDF5',dir:'ltr'},
  {c:'ko',n:'한국어',e:'Korean',f:'\uD83C\uDDF0\uD83C\uDDF7',dir:'ltr'}
];
var curLang=localStorage.getItem(LKEY)||'ar';
var curTheme=localStorage.getItem(TKEY)||'dark';

/* ===== القواميس (تُملأ أدناه) ===== */
var KEY={ar:{
reverifyNow:'إعادة التحقق الآن',totalAssets:'إجمالي الأصول (USDT)',deposit:'إيداع',withdraw:'سحب',transfer:'تحويل',more:'المزيد',liveMarkets:'أبرز الأسواق الحية',viewAll:'عرض الكل ›',navHome:'الرئيسية',navMarkets:'الأسواق',navTrading:'التداول',navFutures:'عقود آجلة',navWallet:'المحفظة',statusPending:'قيد المراجعة',statusVerified:'موثّق',statusRejected:'مرفوض',copy:'نسخ',security:'الأمان والحماية',kyc:'توثيق الهوية (KYC)',settings:'الإعدادات واللغة',accountSettings:'البريد والتنبيهات',help:'المساعدة والدعم',logout:'تسجيل الخروج',changePass:'تغيير كلمة المرور',changePassSub:'حدّث كلمة المرور بانتظام',twofa:'المصادقة الثنائية 2FA',twofaSub:'حماية إضافية عند الدخول',biometric:'بصمة / وجه',biometricSub:'تسجيل دخول سريع',antiTitle:'رمز مكافحة التصيد',save:'حفظ',lastLogin:'آخر تسجيل دخول',curPass:'كلمة المرور الحالية',newPass:'كلمة المرور الجديدة',confPass:'تأكيد كلمة المرور',saveNewPass:'حفظ كلمة المرور',kycPendingTitle:'الحساب قيد المراجعة',kycPendingDesc:'تم استلام وثيقتك وهي قيد المراجعة.',docType:'نوع الوثيقة',status:'الحالة',level:'مستوى التوثيق',language:'اللغة',faq1q:'كيف أودع الأموال؟',faq1a:'اضغط على زر "إيداع" في الصفحة الرئيسية واتبع الخطوات.',faq2q:'كيف أحمي حسابي؟',faq2a:'فعّل المصادقة الثنائية 2FA ورمز مكافحة التصيد من قسم الأمان.',faq3q:'هل المنصة حقيقية؟',faq3a:'هذه منصة تدريبية (تداول تجريبي) بأسعار حية حقيقية من السوق.',liveChat:'الدردشة المباشرة',liveChatSub:'دعم فني 24/7',email:'البريد الإلكتروني',buy:'شراء',sell:'بيع',mAll:'الكل',mFav:'⭐ المفضلة',mGainers:'الأكثر ربحاً',mLosers:'الأكثر خسارة',colCoin:'العملة',colPrice:'السعر',colChange:'التغير 24س',walletTitle:'المحفظة',wEstBalance:'الرصيد التقديري',aSend:'إرسال',aReceive:'استلام',aTransfer:'تحويل',aMore:'المزيد',tabCrypto:'العملات',tabCollectibles:'المقتنيات',tabFav:'المفضلة',wHideSmall:'إخفاء الأرصدة الصغيرة',wAsset:'الأصل',wValue:'الكمية / القيمة',wNoColl:'لا توجد مقتنيات بعد',tabAlerts:'التنبيهات',langChanged:'تم تغيير اللغة'
},en:{
reverifyNow:'Re-verify now',totalAssets:'Total Assets (USDT)',deposit:'Deposit',withdraw:'Withdraw',transfer:'Transfer',more:'More',liveMarkets:'Top Live Markets',viewAll:'View all ›',navHome:'Home',navMarkets:'Markets',navTrading:'Trade',navFutures:'Futures',navWallet:'Wallet',statusPending:'Under review',statusVerified:'Verified',statusRejected:'Rejected',copy:'Copy',security:'Security & Protection',kyc:'Identity Verification (KYC)',settings:'Settings & Language',accountSettings:'Email & Notifications',help:'Help & Support',logout:'Log out',changePass:'Change Password',changePassSub:'Update your password regularly',twofa:'Two-Factor Auth (2FA)',twofaSub:'Extra protection on login',biometric:'Fingerprint / Face',biometricSub:'Fast sign-in',antiTitle:'Anti-Phishing Code',save:'Save',lastLogin:'Last login',curPass:'Current password',newPass:'New password',confPass:'Confirm password',saveNewPass:'Save password',kycPendingTitle:'Account under review',kycPendingDesc:'Your document was received and is under review.',docType:'Document type',status:'Status',level:'Verification level',language:'Language',faq1q:'How do I deposit funds?',faq1a:'Tap the "Deposit" button on the home page and follow the steps.',faq2q:'How do I protect my account?',faq2a:'Enable 2FA and the anti-phishing code from the Security section.',faq3q:'Is the platform real?',faq3a:'This is a training platform (paper trading) with real live market prices.',liveChat:'Live Chat',liveChatSub:'24/7 technical support',email:'Email',buy:'Buy',sell:'Sell',mAll:'All',mFav:'⭐ Favorites',mGainers:'Top Gainers',mLosers:'Top Losers',colCoin:'Coin',colPrice:'Price',colChange:'24h Change',walletTitle:'Wallet',wEstBalance:'Estimated Balance',aSend:'Send',aReceive:'Receive',aTransfer:'Transfer',aMore:'More',tabCrypto:'Crypto',tabCollectibles:'Collectibles',tabFav:'Favorites',wHideSmall:'Hide small balances',wAsset:'Asset',wValue:'Amount / Value',wNoColl:'No collectibles yet',tabAlerts:'Alerts',langChanged:'Language changed'
},tr:{
reverifyNow:'Şimdi yeniden doğrula',totalAssets:'Toplam Varlıklar (USDT)',deposit:'Yatır',withdraw:'Çek',transfer:'Transfer',more:'Daha fazla',liveMarkets:'Canlı Piyasalar',viewAll:'Tümünü gör ›',navHome:'Ana Sayfa',navMarkets:'Piyasalar',navTrading:'İşlem',navFutures:'Vadeli',navWallet:'Cüzdan',statusPending:'İnceleniyor',statusVerified:'Doğrulandı',statusRejected:'Reddedildi',copy:'Kopyala',security:'Güvenlik ve Koruma',kyc:'Kimlik Doğrulama (KYC)',settings:'Ayarlar ve Dil',accountSettings:'E-posta ve Bildirimler',help:'Yardım ve Destek',logout:'Çıkış yap',changePass:'Şifre Değiştir',changePassSub:'Şifrenizi düzenli güncelleyin',twofa:'İki Faktörlü Doğrulama (2FA)',twofaSub:'Girişte ek koruma',biometric:'Parmak izi / Yüz',biometricSub:'Hızlı giriş',antiTitle:'Anti-Phishing Kodu',save:'Kaydet',lastLogin:'Son giriş',curPass:'Mevcut şifre',newPass:'Yeni şifre',confPass:'Şifreyi onayla',saveNewPass:'Şifreyi kaydet',kycPendingTitle:'Hesap inceleniyor',kycPendingDesc:'Belgeniz alındı ve inceleniyor.',docType:'Belge türü',status:'Durum',level:'Doğrulama seviyesi',language:'Dil',faq1q:'Para nasıl yatırırım?',faq1a:'Ana sayfadaki "Yatır" düğmesine dokunun ve adımları izleyin.',faq2q:'Hesabımı nasıl korurum?',faq2a:'Güvenlik bölümünden 2FA ve anti-phishing kodunu etkinleştirin.',faq3q:'Platform gerçek mi?',faq3a:'Bu, gerçek canlı piyasa fiyatlarıyla bir eğitim platformudur (demo işlem).',liveChat:'Canlı Sohbet',liveChatSub:'7/24 teknik destek',email:'E-posta',buy:'Al',sell:'Sat',mAll:'Tümü',mFav:'⭐ Favoriler',mGainers:'En Çok Yükselenler',mLosers:'En Çok Düşenler',colCoin:'Coin',colPrice:'Fiyat',colChange:'24s Değişim',walletTitle:'Cüzdan',wEstBalance:'Tahmini Bakiye',aSend:'Gönder',aReceive:'Al',aTransfer:'Transfer',aMore:'Daha fazla',tabCrypto:'Kripto',tabCollectibles:'Koleksiyon',tabFav:'Favoriler',wHideSmall:'Küçük bakiyeleri gizle',wAsset:'Varlık',wValue:'Miktar / Değer',wNoColl:'Henüz koleksiyon yok',tabAlerts:'Uyarılar',langChanged:'Dil değiştirildi'
},es:{
reverifyNow:'Verificar de nuevo',totalAssets:'Activos Totales (USDT)',deposit:'Depositar',withdraw:'Retirar',transfer:'Transferir',more:'Más',liveMarkets:'Mercados en Vivo',viewAll:'Ver todo ›',navHome:'Inicio',navMarkets:'Mercados',navTrading:'Operar',navFutures:'Futuros',navWallet:'Cartera',statusPending:'En revisión',statusVerified:'Verificado',statusRejected:'Rechazado',copy:'Copiar',security:'Seguridad y Protección',kyc:'Verificación de Identidad (KYC)',settings:'Ajustes e Idioma',accountSettings:'Correo y Notificaciones',help:'Ayuda y Soporte',logout:'Cerrar sesión',changePass:'Cambiar Contraseña',changePassSub:'Actualiza tu contraseña con frecuencia',twofa:'Autenticación de dos factores (2FA)',twofaSub:'Protección adicional al iniciar sesión',biometric:'Huella / Rostro',biometricSub:'Inicio rápido',antiTitle:'Código Anti-Phishing',save:'Guardar',lastLogin:'Último inicio de sesión',curPass:'Contraseña actual',newPass:'Nueva contraseña',confPass:'Confirmar contraseña',saveNewPass:'Guardar contraseña',kycPendingTitle:'Cuenta en revisión',kycPendingDesc:'Tu documento fue recibido y está en revisión.',docType:'Tipo de documento',status:'Estado',level:'Nivel de verificación',language:'Idioma',faq1q:'¿Cómo deposito fondos?',faq1a:'Toca el botón "Depositar" en la página de inicio y sigue los pasos.',faq2q:'¿Cómo protejo mi cuenta?',faq2a:'Activa 2FA y el código anti-phishing desde la sección de Seguridad.',faq3q:'¿La plataforma es real?',faq3a:'Esta es una plataforma de entrenamiento (trading de práctica) con precios reales del mercado.',liveChat:'Chat en Vivo',liveChatSub:'Soporte técnico 24/7',email:'Correo electrónico',buy:'Comprar',sell:'Vender',mAll:'Todos',mFav:'⭐ Favoritos',mGainers:'Mayores Ganadores',mLosers:'Mayores Perdedores',colCoin:'Moneda',colPrice:'Precio',colChange:'Cambio 24h',walletTitle:'Cartera',wEstBalance:'Saldo Estimado',aSend:'Enviar',aReceive:'Recibir',aTransfer:'Transferir',aMore:'Más',tabCrypto:'Cripto',tabCollectibles:'Coleccionables',tabFav:'Favoritos',wHideSmall:'Ocultar saldos pequeños',wAsset:'Activo',wValue:'Cantidad / Valor',wNoColl:'Aún no hay coleccionables',tabAlerts:'Alertas',langChanged:'Idioma cambiado'
}};
var PH={ar:{searchPh:'بحث عن عملة (BTC، ETH)...',searchCoin:'ابحث عن عملة...'},en:{searchPh:'Search a coin (BTC, ETH)...',searchCoin:'Search a coin...'},tr:{searchPh:'Bir coin ara (BTC, ETH)...',searchCoin:'Bir coin ara...'},es:{searchPh:'Buscar una moneda (BTC, ETH)...',searchCoin:'Buscar una moneda...'}};
var SRC={en:{'آخر تسجيل دخول':'Last login',
'أدنى 24س':'24h Low',
'أدوات':'Tools',
'أدوات التداول المتقدمة Trade-X — قيد الإعداد وستتوفر قريباً.':'Advanced trading tools Trade-X — under construction, coming soon.',
'أرباح وخسائر اليوم':"Today's P&L",
'أساسي':'Basic',
'أصغر من ≤':'Less than ≤',
'أعلى 24س':'24h High',
'أكاديمية':'Academy',
'أكبر من ≥':'Greater than ≥',
'إجمالي الأصول (USDT)':'Total Assets (USDT)',
'إخفاء الأرصدة الصغيرة':'Hide small balances',
'إرسال':'Send',
'إزالة الحدود':'Remove limits',
'إضافة الأموال':'Add funds',
'إعادة التحقق الآن':'Re-verify now',
'إعادة المسح':'Re-scan',
'إعلان':'Announcement',
'إغلاق':'Close',
'إغلاق الصفقة':'Close position',
'إلى':'To',
'إنشاء شبكة':'Create grid',
'إيداع':'Deposit',
'إيقاف الخسارة':'Stop Loss',
'ابحث عن أي عملة (مثال: DOGE, ADA, LINK)':'Search any coin (e.g. DOGE, ADA, LINK)',
'ابحث عن عملة...':'Search a coin...',
'ابحث عن لغة...':'Search a language...',
'اسأل عن العملة وتحليلاتها...':'Ask about the coin and its analysis...',
'استلام':'Receive',
'اضغط على زر "إيداع" في الصفحة الرئيسية واتبع الخطوات.':'Tap the "Deposit" button on the home page and follow the steps.',
'اكتب رسالتك أو شكواك...':'Type your message or complaint...',
'الأرصدة':'Balances',
'الأرصدة (':'Balances (',
'الأسهم':'Stocks',
'الأسواق':'Markets',
'الأصل':'Asset',
'الأقصى':'Max',
'الأكثر خسارة':'Top Losers',
'الأكثر ربحاً':'Top Gainers',
'الأمان والحماية':'Security & Protection',
'الأموال':'Funds',
'الأموال المتاحة':'Available funds',
'الأوامر المعلقة':'Pending orders',
'الأوامر المعلّقة':'Pending orders',
'الإجمالي':'Total',
'الإحالة':'Referral',
'الإشعارات':'Notifications',
'الإعدادات واللغة':'Settings & Language',
'الإيداعات':'Deposits',
'الاستثمار':'Investment',
'البريد الإلكتروني':'Email',
'البريد والتنبيهات':'Email & Notifications',
'البيانات':'Data',
'التحويلات':'Transfers',
'التداول':'Trade',
'التداول الافتراضي':'Demo trading',
'التداول التجريبي':'Demo trading',
'التداول الفوري':'Spot trading',
'التداول بالشبكة (':'Grid trading (',
'التداولات':'Trades',
'التعدين':'Mining',
'التغير 24س':'24h Change',
'التفضيلات':'Preferences',
'التمويل':'Funding',
'التنبيهات':'Alerts',
'الحالة':'Status',
'الحجم (القيمة الاسمية)':'Size (notional value)',
'الحجم 24س':'24h Volume',
'الحساب قيد المراجعة':'Account under review',
'الخريطة الحرارية':'Heatmap',
'الدردشة المباشرة':'Live Chat',
'الدعم الفني':'Technical Support',
'الرئيسية':'Home',
'الرافعة المالية':'Leverage',
'الرسوم':'Fees',
'الرصيد':'Balance',
'الرصيد (USDT)':'Balance (USDT)',
'الرصيد التقديري':'Estimated Balance',
'الرصيد المتاح للتداول':'Available trading balance',
'السعر':'Price',
'السعر (USDT)':'Price (USDT)',
'السعر الحالي':'Current price',
'السعر المحدد':'Limit price',
'السوق':'Market',
'السوق صاعد':'Market up',
'السوق هابط':'Market down',
'الشراء':'Buy',
'الشبكة':'Network',
'الصفقات المفتوحة':'Open positions',
'الطاقة':'Energy',
'العملات':'Crypto',
'العملات الرقمية':'Cryptocurrencies',
'العملة':'Coin',
'العقد':'Contract',
'العقود الآجلة':'Futures',
'الكمية':'Amount',
'الكمية (USDT)':'Amount (USDT)',
'الكمية / القيمة':'Amount / Value',
'الكل':'All',
'اللغة':'Language',
'المبلغ':'Amount',
'المبلغ (USDT)':'Amount (USDT)',
'المتاح':'Available',
'المحفظة':'Wallet',
'المدة':'Duration',
'المزيد':'More',
'المساعدة والدعم':'Help & Support',
'المستوى':'Level',
'المصادقة الثنائية 2FA':'Two-Factor Auth (2FA)',
'المقتنيات':'Collectibles',
'المفضلة':'Favorites',
'النوع':'Type',
'الهامش':'Margin',
'الوضع':'Mode',
'الوقت':'Time',
'بالسوق':'Market',
'بحث':'Search',
'بحث عن عملة (BTC، ETH)...':'Search a coin (BTC, ETH)...',
'بصمة / وجه':'Fingerprint / Face',
'بيع':'Sell',
'تأكيد':'Confirm',
'تأكيد الإيداع':'Confirm deposit',
'تأكيد السحب':'Confirm withdrawal',
'تأكيد الطلب':'Confirm order',
'تأكيد كلمة المرور':'Confirm password',
'تبديل':'Switch',
'تحديث':'Refresh',
'تحويل':'Transfer',
'تحويل داخلي':'Internal transfer',
'تداول':'Trade',
'تداول آجل':'Futures trade',
'تحقق':'Verify',
'تراجع':'Back',
'تسجيل الخروج':'Log out',
'تسجيل دخول سريع':'Fast sign-in',
'توثيق الهوية (KYC)':'Identity Verification (KYC)',
'تغيير كلمة المرور':'Change Password',
'ثنائي':'Dual',
'جارٍ':'Ongoing',
'جميع العملات':'All coins',
'حد الإيقاف':'Stop limit',
'حدّث كلمة المرور بانتظام':'Update your password regularly',
'حدود التداول':'Trading limits',
'حركة السوق':'Market movement',
'حسب السعر':'By price',
'حفظ':'Save',
'حفظ كلمة المرور':'Save password',
'حماية إضافية عند الدخول':'Extra protection on login',
'خسارة':'Loss',
'دائم':'Perpetual',
'دعم فني 24/7':'24/7 technical support',
'ربح':'Profit',
'ربح وخسارة':'Profit & Loss',
'رمز التحقق':'Verification code',
'رمز مكافحة التصيد':'Anti-Phishing Code',
'رصيدك':'Your balance',
'سحب':'Withdraw',
'سجل العمليات':'Transaction history',
'سعر الدخول':'Entry price',
'سعر السوق':'Market price',
'سعر التصفية':'Liquidation price',
'سعر الوقف':'Stop price',
'سريع':'Fast',
'سلسلة':'Chain',
'شراء':'Buy',
'شراء ':'Buy ',
'شبكة':'Network',
'صاعد':'Up',
'صفقة شراء':'Long position',
'صفقة بيع':'Short position',
'طلب شراء':'Buy order',
'طلب بيع':'Sell order',
'عالي':'High',
'عدد الشبكات':'Grid count',
'عرض الكل ›':'View all ›',
'عرض المزيد':'View more',
'عقد آجل':'Futures contract',
'عقود آجلة':'Futures',
'عمولة':'Fee',
'عمولة التداول':'Trading fee',
'فتح صفقة':'Open position',
'فوري':'Spot',
'قيد المراجعة':'Under review',
'قيمة الصفقة':'Position value',
'كل العملات':'All coins',
'كلمة المرور الجديدة':'New password',
'كلمة المرور الحالية':'Current password',
'كيف أحمي حسابي؟':'How do I protect my account?',
'كيف أودع الأموال؟':'How do I deposit funds?',
'لا توجد أوامر معلقة':'No pending orders',
'لا توجد بيانات':'No data',
'لا توجد تنبيهات':'No alerts',
'لا توجد صفقات مفتوحة':'No open positions',
'لا توجد مقتنيات بعد':'No collectibles yet',
'لوحة التحكم':'Dashboard',
'مبادلة':'Swap',
'متقدم':'Advanced',
'متوسط':'Medium',
'محفظة التمويل':'Funding wallet',
'محفظة التداول':'Trading wallet',
'محفظة العقود الآجلة':'Futures wallet',
'مدّة':'Period',
'مرفوض':'Rejected',
'مستوى التوثيق':'Verification level',
'موثّق':'Verified',
'نسخ':'Copy',
'نوع الأمر':'Order type',
'نوع الوثيقة':'Document type',
'هابط':'Down',
'هذه منصة تدريبية (تداول تجريبي) بأسعار حية حقيقية من السوق.':'This is a training platform (paper trading) with real live market prices.',
'هل المنصة حقيقية؟':'Is the platform real?',
'وثيقة الهوية':'ID document',
'وضع الهامش':'Margin mode',
'يومي':'Daily',
'أسبوعي':'Weekly',
'شهري':'Monthly',
'سنوي':'Yearly',
'متاح':'Available',
'مغلق':'Closed',
'مفتوح':'Open',
'نشط':'Active',
'مكتمل':'Completed',
'ملغي':'Cancelled',
'إلغاء':'Cancel',
'تم بنجاح':'Success',
'فشل':'Failed',
'خطأ':'Error',
'تحذير':'Warning',
'ملاحظة':'Note',
'المزيد من التفاصيل':'More details',
'تم نسخ العنوان':'Address copied',
'العنوان':'Address',
'المستلم':'Recipient',
'المرسل':'Sender',
'التاريخ':'Date',
'المبلغ المستلم':'Amount received',
'محفظة العملات':'Spot wallet',
'الحد الأدنى':'Minimum',
'الحد الأقصى':'Maximum',
'متاح للسحب':'Available to withdraw',
'رسوم الشبكة':'Network fee',
'ستصل الأموال':'Funds will arrive',
'نسخ العنوان':'Copy address',
'امسح الرمز':'Scan the code',
'أدخل المبلغ':'Enter amount',
'أدخل العنوان':'Enter address',
'اختر العملة':'Select coin',
'اختر الشبكة':'Select network',
'متوسط السعر':'Average price',
'إجمالي القيمة':'Total value',
'الربح غير المحقق':'Unrealized P&L',
'الربح المحقق':'Realized P&L',
'نسبة التغير':'Change %',
'العائد':'Return',
'تم تغيير اللغة':'Language changed',
'اختر اللغة':'Select language',
'المظهر':'Theme',
'فاتح':'Light',
'داكن':'Dark',
'تسجيل الدخول':'Sign in',
'إنشاء حساب':'Create account'
},tr:{'آخر تسجيل دخول':'Son giriş',
'أدنى 24س':'24s Düşük',
'أدوات':'Araçlar',
'أدوات التداول المتقدمة Trade-X — قيد الإعداد وستتوفر قريباً.':'Gelişmiş işlem araçları Trade-X — yapım aşamasında, yakında.',
'أرباح وخسائر اليوم':'Günün Kâr/Zararı',
'أساسي':'Temel',
'أصغر من ≤':'Küçüktür ≤',
'أعلى 24س':'24s Yüksek',
'أكاديمية':'Akademi',
'أكبر من ≥':'Büyüktür ≥',
'إجمالي الأصول (USDT)':'Toplam Varlıklar (USDT)',
'إخفاء الأرصدة الصغيرة':'Küçük bakiyeleri gizle',
'إرسال':'Gönder',
'إزالة الحدود':'Limitleri kaldır',
'إضافة الأموال':'Para ekle',
'إعادة التحقق الآن':'Şimdi yeniden doğrula',
'إعادة المسح':'Yeniden tara',
'إعلان':'Duyuru',
'إغلاق':'Kapat',
'إغلاق الصفقة':'Pozisyonu kapat',
'إلى':'Kime',
'إنشاء شبكة':'Grid oluştur',
'إيداع':'Yatır',
'إيقاف الخسارة':'Zarar Durdur',
'ابحث عن أي عملة (مثال: DOGE, ADA, LINK)':'Herhangi bir coin ara (örn. DOGE, ADA, LINK)',
'ابحث عن عملة...':'Bir coin ara...',
'ابحث عن لغة...':'Bir dil ara...',
'اسأل عن العملة وتحليلاتها...':'Coin ve analizleri hakkında sorun...',
'استلام':'Al',
'اضغط على زر "إيداع" في الصفحة الرئيسية واتبع الخطوات.':'Ana sayfadaki "Yatır" düğmesine dokunun ve adımları izleyin.',
'اكتب رسالتك أو شكواك...':'Mesajınızı veya şikayetinizi yazın...',
'الأرصدة':'Bakiyeler',
'الأرصدة (':'Bakiyeler (',
'الأسهم':'Hisseler',
'الأسواق':'Piyasalar',
'الأصل':'Varlık',
'الأقصى':'Maks',
'الأكثر خسارة':'En Çok Düşenler',
'الأكثر ربحاً':'En Çok Yükselenler',
'الأمان والحماية':'Güvenlik ve Koruma',
'الأموال':'Fonlar',
'الأموال المتاحة':'Kullanılabilir fonlar',
'الأوامر المعلقة':'Bekleyen emirler',
'الأوامر المعلّقة':'Bekleyen emirler',
'الإجمالي':'Toplam',
'الإحالة':'Referans',
'الإشعارات':'Bildirimler',
'الإعدادات واللغة':'Ayarlar ve Dil',
'الإيداعات':'Yatırmalar',
'الاستثمار':'Yatırım',
'البريد الإلكتروني':'E-posta',
'البريد والتنبيهات':'E-posta ve Bildirimler',
'البيانات':'Veriler',
'التحويلات':'Transferler',
'التداول':'İşlem',
'التداول الافتراضي':'Demo işlem',
'التداول التجريبي':'Demo işlem',
'التداول الفوري':'Spot işlem',
'التداول بالشبكة (':'Grid işlem (',
'التداولات':'İşlemler',
'التعدين':'Madencilik',
'التغير 24س':'24s Değişim',
'التفضيلات':'Tercihler',
'التمويل':'Finansman',
'التنبيهات':'Uyarılar',
'الحالة':'Durum',
'الحجم (القيمة الاسمية)':'Boyut (nominal değer)',
'الحجم 24س':'24s Hacim',
'الحساب قيد المراجعة':'Hesap inceleniyor',
'الخريطة الحرارية':'Isı Haritası',
'الدردشة المباشرة':'Canlı Sohbet',
'الدعم الفني':'Teknik Destek',
'الرئيسية':'Ana Sayfa',
'الرافعة المالية':'Kaldıraç',
'الرسوم':'Ücretler',
'الرصيد':'Bakiye',
'الرصيد (USDT)':'Bakiye (USDT)',
'الرصيد التقديري':'Tahmini Bakiye',
'الرصيد المتاح للتداول':'Kullanılabilir işlem bakiyesi',
'السعر':'Fiyat',
'السعر (USDT)':'Fiyat (USDT)',
'السعر الحالي':'Mevcut fiyat',
'السعر المحدد':'Limit fiyat',
'السوق':'Piyasa',
'السوق صاعد':'Piyasa yükseliyor',
'السوق هابط':'Piyasa düşüyor',
'الشراء':'Al',
'الشبكة':'Ağ',
'الصفقات المفتوحة':'Açık pozisyonlar',
'الطاقة':'Enerji',
'العملات':'Kripto',
'العملات الرقمية':'Kripto paralar',
'العملة':'Coin',
'العقد':'Sözleşme',
'العقود الآجلة':'Vadeli',
'الكمية':'Miktar',
'الكمية (USDT)':'Miktar (USDT)',
'الكمية / القيمة':'Miktar / Değer',
'الكل':'Tümü',
'اللغة':'Dil',
'المبلغ':'Tutar',
'المبلغ (USDT)':'Tutar (USDT)',
'المتاح':'Kullanılabilir',
'المحفظة':'Cüzdan',
'المدة':'Süre',
'المزيد':'Daha fazla',
'المساعدة والدعم':'Yardım ve Destek',
'المستوى':'Seviye',
'المصادقة الثنائية 2FA':'İki Faktörlü Doğrulama (2FA)',
'المقتنيات':'Koleksiyon',
'المفضلة':'Favoriler',
'النوع':'Tür',
'الهامش':'Marj',
'الوضع':'Mod',
'الوقت':'Zaman',
'بالسوق':'Piyasa',
'بحث':'Ara',
'بحث عن عملة (BTC، ETH)...':'Bir coin ara (BTC, ETH)...',
'بصمة / وجه':'Parmak izi / Yüz',
'بيع':'Sat',
'تأكيد':'Onayla',
'تأكيد الإيداع':'Yatırmayı onayla',
'تأكيد السحب':'Çekimi onayla',
'تأكيد الطلب':'Emri onayla',
'تأكيد كلمة المرور':'Şifreyi onayla',
'تبديل':'Değiştir',
'تحديث':'Yenile',
'تحويل':'Transfer',
'تحويل داخلي':'Dahili transfer',
'تداول':'İşlem',
'تداول آجل':'Vadeli işlem',
'تحقق':'Doğrula',
'تراجع':'Geri',
'تسجيل الخروج':'Çıkış yap',
'تسجيل دخول سريع':'Hızlı giriş',
'توثيق الهوية (KYC)':'Kimlik Doğrulama (KYC)',
'تغيير كلمة المرور':'Şifre Değiştir',
'ثنائي':'İkili',
'جارٍ':'Devam ediyor',
'جميع العملات':'Tüm coinler',
'حد الإيقاف':'Stop limit',
'حدّث كلمة المرور بانتظام':'Şifrenizi düzenli güncelleyin',
'حدود التداول':'İşlem limitleri',
'حركة السوق':'Piyasa hareketi',
'حسب السعر':'Fiyata göre',
'حفظ':'Kaydet',
'حفظ كلمة المرور':'Şifreyi kaydet',
'حماية إضافية عند الدخول':'Girişte ek koruma',
'خسارة':'Zarar',
'دائم':'Sürekli',
'دعم فني 24/7':'7/24 teknik destek',
'ربح':'Kâr',
'ربح وخسارة':'Kâr ve Zarar',
'رمز التحقق':'Doğrulama kodu',
'رمز مكافحة التصيد':'Anti-Phishing Kodu',
'رصيدك':'Bakiyeniz',
'سحب':'Çek',
'سجل العمليات':'İşlem geçmişi',
'سعر الدخول':'Giriş fiyatı',
'سعر السوق':'Piyasa fiyatı',
'سعر التصفية':'Likidasyon fiyatı',
'سعر الوقف':'Stop fiyatı',
'سريع':'Hızlı',
'سلسلة':'Zincir',
'شراء':'Al',
'شراء ':'Al ',
'شبكة':'Ağ',
'صاعد':'Yükseliş',
'صفقة شراء':'Long pozisyon',
'صفقة بيع':'Short pozisyon',
'طلب شراء':'Alış emri',
'طلب بيع':'Satış emri',
'عالي':'Yüksek',
'عدد الشبكات':'Grid sayısı',
'عرض الكل ›':'Tümünü gör ›',
'عرض المزيد':'Daha fazla gör',
'عقد آجل':'Vadeli sözleşme',
'عقود آجلة':'Vadeli',
'عمولة':'Komisyon',
'عمولة التداول':'İşlem komisyonu',
'فتح صفقة':'Pozisyon aç',
'فوري':'Spot',
'قيد المراجعة':'İnceleniyor',
'قيمة الصفقة':'Pozisyon değeri',
'كل العملات':'Tüm coinler',
'كلمة المرور الجديدة':'Yeni şifre',
'كلمة المرور الحالية':'Mevcut şifre',
'كيف أحمي حسابي؟':'Hesabımı nasıl korurum?',
'كيف أودع الأموال؟':'Para nasıl yatırırım?',
'لا توجد أوامر معلقة':'Bekleyen emir yok',
'لا توجد بيانات':'Veri yok',
'لا توجد تنبيهات':'Uyarı yok',
'لا توجد صفقات مفتوحة':'Açık pozisyon yok',
'لا توجد مقتنيات بعد':'Henüz koleksiyon yok',
'لوحة التحكم':'Panel',
'مبادلة':'Takas',
'متقدم':'Gelişmiş',
'متوسط':'Orta',
'محفظة التمويل':'Finansman cüzdanı',
'محفظة التداول':'İşlem cüzdanı',
'محفظة العقود الآجلة':'Vadeli cüzdanı',
'مدّة':'Süre',
'مرفوض':'Reddedildi',
'مستوى التوثيق':'Doğrulama seviyesi',
'موثّق':'Doğrulandı',
'نسخ':'Kopyala',
'نوع الأمر':'Emir türü',
'نوع الوثيقة':'Belge türü',
'هابط':'Düşüş',
'هذه منصة تدريبية (تداول تجريبي) بأسعار حية حقيقية من السوق.':'Bu, gerçek canlı piyasa fiyatlarıyla bir eğitim platformudur (demo işlem).',
'هل المنصة حقيقية؟':'Platform gerçek mi?',
'وثيقة الهوية':'Kimlik belgesi',
'وضع الهامش':'Marj modu',
'يومي':'Günlük',
'أسبوعي':'Haftalık',
'شهري':'Aylık',
'سنوي':'Yıllık',
'متاح':'Mevcut',
'مغلق':'Kapalı',
'مفتوح':'Açık',
'نشط':'Aktif',
'مكتمل':'Tamamlandı',
'ملغي':'İptal edildi',
'إلغاء':'İptal',
'تم بنجاح':'Başarılı',
'فشل':'Başarısız',
'خطأ':'Hata',
'تحذير':'Uyarı',
'ملاحظة':'Not',
'المزيد من التفاصيل':'Daha fazla detay',
'تم نسخ العنوان':'Adres kopyalandı',
'العنوان':'Adres',
'المستلم':'Alıcı',
'المرسل':'Gönderen',
'التاريخ':'Tarih',
'المبلغ المستلم':'Alınan tutar',
'محفظة العملات':'Spot cüzdanı',
'الحد الأدنى':'Minimum',
'الحد الأقصى':'Maksimum',
'متاح للسحب':'Çekilebilir',
'رسوم الشبكة':'Ağ ücreti',
'ستصل الأموال':'Fonlar ulaşacak',
'نسخ العنوان':'Adresi kopyala',
'امسح الرمز':'Kodu tara',
'أدخل المبلغ':'Tutarı girin',
'أدخل العنوان':'Adresi girin',
'اختر العملة':'Coin seçin',
'اختر الشبكة':'Ağ seçin',
'متوسط السعر':'Ortalama fiyat',
'إجمالي القيمة':'Toplam değer',
'الربح غير المحقق':'Gerçekleşmemiş K/Z',
'الربح المحقق':'Gerçekleşen K/Z',
'نسبة التغير':'Değişim %',
'العائد':'Getiri',
'تم تغيير اللغة':'Dil değiştirildi',
'اختر اللغة':'Dil seçin',
'المظهر':'Tema',
'فاتح':'Açık',
'داكن':'Koyu',
'تسجيل الدخول':'Giriş yap',
'إنشاء حساب':'Hesap oluştur'},es:{'آخر تسجيل دخول':'Último inicio de sesión',
'أدنى 24س':'Mínimo 24h',
'أدوات':'Herramientas',
'أدوات التداول المتقدمة Trade-X — قيد الإعداد وستتوفر قريباً.':'Herramientas de trading avanzadas Trade-X — en construcción, próximamente.',
'أرباح وخسائر اليوم':'P&L de hoy',
'أساسي':'Básico',
'أصغر من ≤':'Menor que ≤',
'أعلى 24س':'Máximo 24h',
'أكاديمية':'Academia',
'أكبر من ≥':'Mayor que ≥',
'إجمالي الأصول (USDT)':'Activos Totales (USDT)',
'إخفاء الأرصدة الصغيرة':'Ocultar saldos pequeños',
'إرسال':'Enviar',
'إزالة الحدود':'Quitar límites',
'إضافة الأموال':'Añadir fondos',
'إعادة التحقق الآن':'Verificar de nuevo',
'إعادة المسح':'Volver a escanear',
'إعلان':'Anuncio',
'إغلاق':'Cerrar',
'إغلاق الصفقة':'Cerrar posición',
'إلى':'Para',
'إنشاء شبكة':'Crear grid',
'إيداع':'Depositar',
'إيقاف الخسارة':'Stop Loss',
'ابحث عن أي عملة (مثال: DOGE, ADA, LINK)':'Busca cualquier moneda (ej. DOGE, ADA, LINK)',
'ابحث عن عملة...':'Buscar una moneda...',
'ابحث عن لغة...':'Buscar un idioma...',
'اسأل عن العملة وتحليلاتها...':'Pregunta sobre la moneda y sus análisis...',
'استلام':'Recibir',
'اضغط على زر "إيداع" في الصفحة الرئيسية واتبع الخطوات.':'Toca el botón "Depositar" en la página de inicio y sigue los pasos.',
'اكتب رسالتك أو شكواك...':'Escribe tu mensaje o reclamación...',
'الأرصدة':'Saldos',
'الأرصدة (':'Saldos (',
'الأسهم':'Acciones',
'الأسواق':'Mercados',
'الأصل':'Activo',
'الأقصى':'Máx',
'الأكثر خسارة':'Mayores Perdedores',
'الأكثر ربحاً':'Mayores Ganadores',
'الأمان والحماية':'Seguridad y Protección',
'الأموال':'Fondos',
'الأموال المتاحة':'Fondos disponibles',
'الأوامر المعلقة':'Órdenes pendientes',
'الأوامر المعلّقة':'Órdenes pendientes',
'الإجمالي':'Total',
'الإحالة':'Referido',
'الإشعارات':'Notificaciones',
'الإعدادات واللغة':'Ajustes e Idioma',
'الإيداعات':'Depósitos',
'الاستثمار':'Inversión',
'البريد الإلكتروني':'Correo electrónico',
'البريد والتنبيهات':'Correo y Notificaciones',
'البيانات':'Datos',
'التحويلات':'Transferencias',
'التداول':'Operar',
'التداول الافتراضي':'Trading demo',
'التداول التجريبي':'Trading demo',
'التداول الفوري':'Trading spot',
'التداول بالشبكة (':'Trading grid (',
'التداولات':'Operaciones',
'التعدين':'Minería',
'التغير 24س':'Cambio 24h',
'التفضيلات':'Preferencias',
'التمويل':'Financiación',
'التنبيهات':'Alertas',
'الحالة':'Estado',
'الحجم (القيمة الاسمية)':'Tamaño (valor nominal)',
'الحجم 24س':'Volumen 24h',
'الحساب قيد المراجعة':'Cuenta en revisión',
'الخريطة الحرارية':'Mapa de calor',
'الدردشة المباشرة':'Chat en Vivo',
'الدعم الفني':'Soporte Técnico',
'الرئيسية':'Inicio',
'الرافعة المالية':'Apalancamiento',
'الرسوم':'Comisiones',
'الرصيد':'Saldo',
'الرصيد (USDT)':'Saldo (USDT)',
'الرصيد التقديري':'Saldo Estimado',
'الرصيد المتاح للتداول':'Saldo disponible para operar',
'السعر':'Precio',
'السعر (USDT)':'Precio (USDT)',
'السعر الحالي':'Precio actual',
'السعر المحدد':'Precio límite',
'السوق':'Mercado',
'السوق صاعد':'Mercado al alza',
'السوق هابط':'Mercado a la baja',
'الشراء':'Comprar',
'الشبكة':'Red',
'الصفقات المفتوحة':'Posiciones abiertas',
'الطاقة':'Energía',
'العملات':'Cripto',
'العملات الرقمية':'Criptomonedas',
'العملة':'Moneda',
'العقد':'Contrato',
'العقود الآجلة':'Futuros',
'الكمية':'Cantidad',
'الكمية (USDT)':'Cantidad (USDT)',
'الكمية / القيمة':'Cantidad / Valor',
'الكل':'Todos',
'اللغة':'Idioma',
'المبلغ':'Importe',
'المبلغ (USDT)':'Importe (USDT)',
'المتاح':'Disponible',
'المحفظة':'Cartera',
'المدة':'Duración',
'المزيد':'Más',
'المساعدة والدعم':'Ayuda y Soporte',
'المستوى':'Nivel',
'المصادقة الثنائية 2FA':'Autenticación de dos factores (2FA)',
'المقتنيات':'Coleccionables',
'المفضلة':'Favoritos',
'النوع':'Tipo',
'الهامش':'Margen',
'الوضع':'Modo',
'الوقت':'Hora',
'بالسوق':'Mercado',
'بحث':'Buscar',
'بحث عن عملة (BTC، ETH)...':'Buscar una moneda (BTC, ETH)...',
'بصمة / وجه':'Huella / Rostro',
'بيع':'Vender',
'تأكيد':'Confirmar',
'تأكيد الإيداع':'Confirmar depósito',
'تأكيد السحب':'Confirmar retiro',
'تأكيد الطلب':'Confirmar orden',
'تأكيد كلمة المرور':'Confirmar contraseña',
'تبديل':'Cambiar',
'تحديث':'Actualizar',
'تحويل':'Transferir',
'تحويل داخلي':'Transferencia interna',
'تداول':'Operar',
'تداول آجل':'Operación de futuros',
'تحقق':'Verificar',
'تراجع':'Atrás',
'تسجيل الخروج':'Cerrar sesión',
'تسجيل دخول سريع':'Inicio rápido',
'توثيق الهوية (KYC)':'Verificación de Identidad (KYC)',
'تغيير كلمة المرور':'Cambiar Contraseña',
'ثنائي':'Dual',
'جارٍ':'En curso',
'جميع العملات':'Todas las monedas',
'حد الإيقاف':'Stop limit',
'حدّث كلمة المرور بانتظام':'Actualiza tu contraseña con frecuencia',
'حدود التداول':'Límites de trading',
'حركة السوق':'Movimiento del mercado',
'حسب السعر':'Por precio',
'حفظ':'Guardar',
'حفظ كلمة المرور':'Guardar contraseña',
'حماية إضافية عند الدخول':'Protección adicional al iniciar sesión',
'خسارة':'Pérdida',
'دائم':'Perpetuo',
'دعم فني 24/7':'Soporte técnico 24/7',
'ربح':'Ganancia',
'ربح وخسارة':'Ganancias y Pérdidas',
'رمز التحقق':'Código de verificación',
'رمز مكافحة التصيد':'Código Anti-Phishing',
'رصيدك':'Tu saldo',
'سحب':'Retirar',
'سجل العمليات':'Historial de transacciones',
'سعر الدخول':'Precio de entrada',
'سعر السوق':'Precio de mercado',
'سعر التصفية':'Precio de liquidación',
'سعر الوقف':'Precio stop',
'سريع':'Rápido',
'سلسلة':'Cadena',
'شراء':'Comprar',
'شراء ':'Comprar ',
'شبكة':'Red',
'صاعد':'Al alza',
'صفقة شراء':'Posición larga',
'صفقة بيع':'Posición corta',
'طلب شراء':'Orden de compra',
'طلب بيع':'Orden de venta',
'عالي':'Alto',
'عدد الشبكات':'Número de grids',
'عرض الكل ›':'Ver todo ›',
'عرض المزيد':'Ver más',
'عقد آجل':'Contrato de futuros',
'عقود آجلة':'Futuros',
'عمولة':'Comisión',
'عمولة التداول':'Comisión de trading',
'فتح صفقة':'Abrir posición',
'فوري':'Spot',
'قيد المراجعة':'En revisión',
'قيمة الصفقة':'Valor de la posición',
'كل العملات':'Todas las monedas',
'كلمة المرور الجديدة':'Nueva contraseña',
'كلمة المرور الحالية':'Contraseña actual',
'كيف أحمي حسابي؟':'¿Cómo protejo mi cuenta?',
'كيف أودع الأموال؟':'¿Cómo deposito fondos?',
'لا توجد أوامر معلقة':'No hay órdenes pendientes',
'لا توجد بيانات':'Sin datos',
'لا توجد تنبيهات':'Sin alertas',
'لا توجد صفقات مفتوحة':'No hay posiciones abiertas',
'لا توجد مقتنيات بعد':'Aún no hay coleccionables',
'لوحة التحكم':'Panel',
'مبادلة':'Intercambio',
'متقدم':'Avanzado',
'متوسط':'Medio',
'محفظة التمويل':'Cartera de financiación',
'محفظة التداول':'Cartera de trading',
'محفظة العقود الآجلة':'Cartera de futuros',
'مدّة':'Periodo',
'مرفوض':'Rechazado',
'مستوى التوثيق':'Nivel de verificación',
'موثّق':'Verificado',
'نسخ':'Copiar',
'نوع الأمر':'Tipo de orden',
'نوع الوثيقة':'Tipo de documento',
'هابط':'A la baja',
'هذه منصة تدريبية (تداول تجريبي) بأسعار حية حقيقية من السوق.':'Esta es una plataforma de entrenamiento (trading de práctica) con precios reales del mercado.',
'هل المنصة حقيقية؟':'¿La plataforma es real?',
'وثيقة الهوية':'Documento de identidad',
'وضع الهامش':'Modo de margen',
'يومي':'Diario',
'أسبوعي':'Semanal',
'شهري':'Mensual',
'سنوي':'Anual',
'متاح':'Disponible',
'مغلق':'Cerrado',
'مفتوح':'Abierto',
'نشط':'Activo',
'مكتمل':'Completado',
'ملغي':'Cancelado',
'إلغاء':'Cancelar',
'تم بنجاح':'Éxito',
'فشل':'Fallido',
'خطأ':'Error',
'تحذير':'Advertencia',
'ملاحظة':'Nota',
'المزيد من التفاصيل':'Más detalles',
'تم نسخ العنوان':'Dirección copiada',
'العنوان':'Dirección',
'المستلم':'Destinatario',
'المرسل':'Remitente',
'التاريخ':'Fecha',
'المبلغ المستلم':'Importe recibido',
'محفظة العملات':'Cartera spot',
'الحد الأدنى':'Mínimo',
'الحد الأقصى':'Máximo',
'متاح للسحب':'Disponible para retirar',
'رسوم الشبكة':'Comisión de red',
'ستصل الأموال':'Los fondos llegarán',
'نسخ العنوان':'Copiar dirección',
'امسح الرمز':'Escanea el código',
'أدخل المبلغ':'Introduce el importe',
'أدخل العنوان':'Introduce la dirección',
'اختر العملة':'Selecciona la moneda',
'اختر الشبكة':'Selecciona la red',
'متوسط السعر':'Precio medio',
'إجمالي القيمة':'Valor total',
'الربح غير المحقق':'P&L no realizado',
'الربح المحقق':'P&L realizado',
'نسبة التغير':'Cambio %',
'العائد':'Rendimiento',
'تم تغيير اللغة':'Idioma cambiado',
'اختر اللغة':'Selecciona el idioma',
'المظهر':'Tema',
'فاتح':'Claro',
'داكن':'Oscuro',
'تسجيل الدخول':'Iniciar sesión',
'إنشاء حساب':'Crear cuenta'}};

function dirOf(c){for(var i=0;i<LANGS.length;i++){if(LANGS[i].c===c)return LANGS[i].dir;}return 'ltr';}
function keyT(lang,k){var d=KEY[lang]||KEY.en;return (d&&d[k])||(KEY.en&&KEY.en[k])||(KEY.ar&&KEY.ar[k])||'';}
function phT(lang,k){var d=PH[lang]||PH.en;return (d&&d[k])||(PH.en&&PH.en[k])||'';}
function srcT(lang,txt){if(lang==='ar')return txt;var d=SRC[lang]||SRC.en;var v=(d&&d[txt]);if(v!=null)return v;v=(SRC.en&&SRC.en[txt]);return v!=null?v:null;}

var _busy=false;

/* ترجمة العناصر ذات المفتاح */
function applyKeyed(root,lang){
  var els=root.querySelectorAll?root.querySelectorAll('[data-i18n]'):[];
  [].forEach.call(els,function(el){var k=el.getAttribute('data-i18n');var v=keyT(lang,k);if(v)el.textContent=v;});
  if(root.nodeType===1&&root.hasAttribute&&root.hasAttribute('data-i18n')){var k2=root.getAttribute('data-i18n');var v2=keyT(lang,k2);if(v2)root.textContent=v2;}
  var phs=root.querySelectorAll?root.querySelectorAll('[data-i18n-ph]'):[];
  [].forEach.call(phs,function(el){var k=el.getAttribute('data-i18n-ph');var v=phT(lang,k);if(v)el.setAttribute('placeholder',v);});
}

/* ترجمة النصوص الحرة (المكتوبة مباشرة بالعربية) */
function walkText(root,lang){
  if(!root||!root.ownerDocument&&root.nodeType!==9&&root.nodeType!==1)return;
  var doc=root.ownerDocument||document;
  var tw=doc.createTreeWalker(root.nodeType===3?root.parentNode||root:root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
    var p=n.parentNode;if(!p)return NodeFilter.FILTER_REJECT;
    var tag=p.nodeName;
    if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||tag==='NOSCRIPT')return NodeFilter.FILTER_REJECT;
    if(p.closest&&p.closest('[data-i18n],.apx-i18n-skip'))return NodeFilter.FILTER_REJECT;
    if(n.__ar!=null)return NodeFilter.FILTER_ACCEPT;
    return AR.test(n.nodeValue||'')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
  }},false);
  var arr=[],n;while((n=tw.nextNode()))arr.push(n);
  arr.forEach(function(tn){
    if(tn.__ar==null)tn.__ar=tn.nodeValue;
    var orig=tn.__ar;if(!AR.test(orig))return;
    var trimmed=orig.replace(/^\s+|\s+$/g,'');
    var lead=orig.slice(0,orig.length-orig.replace(/^\s+/,'').length);
    var trail=orig.slice(orig.replace(/\s+$/,'').length);
    var v;
    if(lang==='ar')v=orig;else{var tr=srcT(lang,trimmed);v=(tr!=null)?(lead+tr+trail):orig;}
    if(tn.nodeValue!==v)tn.nodeValue=v;
  });
}

/* ترجمة سمات النص (placeholder/title/aria-label/alt) غير المربوطة بمفتاح */
function walkAttrs(root,lang){
  var els=root.querySelectorAll?root.querySelectorAll('[placeholder],[title],[aria-label],[alt]'):[];
  [].forEach.call(els,function(el){
    if(el.closest&&el.closest('.apx-i18n-skip'))return;
    ['placeholder','title','aria-label','alt'].forEach(function(a){
      if(!el.hasAttribute(a))return;
      if(a==='placeholder'&&el.hasAttribute('data-i18n-ph'))return;
      var store='__a_'+a;
      if(el[store]==null){var cur=el.getAttribute(a);if(!AR.test(cur||''))return;el[store]=cur;}
      var orig=el[store];var v=(lang==='ar')?orig:(srcT(lang,orig.replace(/^\s+|\s+$/g,''))||orig);
      if(el.getAttribute(a)!==v)el.setAttribute(a,v);
    });
  });
}

function applyToRoot(root,lang){applyKeyed(root,lang);walkText(root,lang);walkAttrs(root,lang);}

function apply(lang){
  if(!lang)lang=curLang;
  curLang=lang;try{localStorage.setItem(LKEY,lang);}catch(e){}
  var de=document.documentElement;
  de.lang=lang;de.dir=dirOf(lang);
  if(document.body){
    _busy=true;
    try{applyToRoot(document.body,lang);}finally{setTimeout(function(){_busy=false;},0);}
  }
  updateCtrl();
  if(document.body){try{bindSettings();}catch(e){}}
  if(typeof window.onApexLang==='function'){try{window.onApexLang(lang);}catch(e){}}
}

/* ===== المظهر ===== */
function applyTheme(mode){
  curTheme=(mode==='light')?'light':'dark';
  try{localStorage.setItem(TKEY,curTheme);}catch(e){}
  document.documentElement.setAttribute('data-theme',curTheme);
  updateCtrl();
}
function toggleTheme(){applyTheme(curTheme==='light'?'dark':'light');}

/* ===== شريط التحكم (أيقونتي اللغة والمظهر) + نافذة اختيار اللغة ===== */
var SUN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.6M19.4 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>';
var MOON='<svg viewBox="0 0 24 24"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';
var GLOBE='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';

function injectStyle(){
  if(document.getElementById('apxI18nStyle'))return;
  var st=document.createElement('style');st.id='apxI18nStyle';
  st.textContent=[
   'html[data-theme="light"]{--bg:#eef1f6;--card:#ffffff;--card2:#f3f5f9;--line:#dde3ec;--txt:#222a35;--mut:#5c6675;--yellow:#a9770a;--panel:#ffffff;--panel2:#f3f5f9;--border:#dde3ec;--muted:#5c6675;--gold1:#c9930a;--gold2:#a9770a;--green:#0a8f54;--red:#d22f46;}',
   'html[data-theme="light"] body{background:var(--bg);color:var(--txt);}',
   'html[data-theme="light"] ::-webkit-scrollbar-thumb{background:#c7cfdb;}',
   'html[data-theme="light"] input,html[data-theme="light"] textarea,html[data-theme="light"] select{color:var(--txt);}',
   'html[data-theme="light"] .apx-ctrl .apx-cbtn{background:#fff;border-color:#dde3ec;color:#222a35;box-shadow:0 2px 12px rgba(20,30,50,.12)}',
   '.apx-ctrl{position:fixed;inset-inline-start:12px;bottom:74px;z-index:99990;display:flex;flex-direction:column;gap:8px}',
   '.apx-ctrl .apx-cbtn{width:42px;height:42px;border-radius:50%;border:1px solid var(--line,#1f2731);background:var(--card,#12161c);color:var(--txt,#eaecef);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:0}',
   '.apx-ctrl .apx-cbtn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
   '.apx-ctrl .apx-cbtn:active{transform:scale(.92)}',
   '.apx-lov{position:fixed;inset:0;z-index:99991;background:rgba(0,0,0,.55);display:none;align-items:flex-end;justify-content:center}',
   '.apx-lov.on{display:flex}',
   '.apx-lsheet{width:100%;max-width:460px;max-height:80vh;background:var(--card,#12161c);color:var(--txt,#eaecef);border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.4)}',
   '.apx-lshd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#1f2731);font-weight:800}',
   '.apx-lshd button{margin-inline-start:auto;background:none;border:none;color:var(--mut,#848e9c);font-size:22px;cursor:pointer;line-height:1}',
   '.apx-theme-box{padding:12px 16px 4px}',
   '.apx-theme-lbl{font-size:12px;color:var(--mut,#848e9c);margin-bottom:8px;font-weight:700}',
   '.apx-seg{display:flex;gap:8px}',
   '.apx-seg button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 8px;border-radius:12px;border:1px solid var(--line,#1f2731);background:var(--card2,#161b22);color:var(--txt,#eaecef);font-size:13.5px;font-weight:700;cursor:pointer}',
   '.apx-seg button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
   '.apx-seg button.on{border-color:var(--gold2,#e0a615);background:rgba(224,166,21,.14);color:var(--gold2,#e0a615)}',
   '.apx-lsrch{padding:10px 16px}',
   '.apx-lsrch input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--line,#1f2731);background:var(--card2,#161b22);color:var(--txt,#eaecef);font-size:14px;outline:none}',
   '.apx-llist{overflow:auto;padding:4px 8px 16px}',
   '.apx-lrow{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer}',
   '.apx-lrow:hover{background:var(--card2,#161b22)}',
   '.apx-lrow.sel{background:rgba(224,166,21,.14)}',
   '.apx-lrow .fl{font-size:22px}',
   '.apx-lrow .ln{display:flex;flex-direction:column}',
   '.apx-lrow .ln b{font-size:14.5px}',
   '.apx-lrow .ln span{font-size:11.5px;color:var(--mut,#848e9c)}',
   '.apx-lrow .tk{margin-inline-start:auto;color:var(--gold2,#e0a615);font-weight:800;display:none}',
   '.apx-lrow.sel .tk{display:block}'
  ].join('\n');
  document.head.appendChild(st);
}

function buildCtrl(){
  if(document.getElementById('apxCtrl'))return;
  var wrap=document.createElement('div');wrap.id='apxCtrl';wrap.className='apx-ctrl apx-i18n-skip';
  var bt=document.createElement('button');bt.className='apx-cbtn';bt.id='apxThemeBtn';bt.type='button';
  bt.setAttribute('aria-label','Theme');bt.onclick=function(){toggleTheme();};
  var bl=document.createElement('button');bl.className='apx-cbtn';bl.id='apxLangBtn';bl.type='button';
  bl.setAttribute('aria-label','Language');bl.innerHTML=GLOBE;bl.onclick=function(){openPicker();};
  wrap.appendChild(bt);wrap.appendChild(bl);
  document.body.appendChild(wrap);

  var ov=document.createElement('div');ov.className='apx-lov apx-i18n-skip';ov.id='apxLov';
  ov.innerHTML='<div class="apx-lsheet"><div class="apx-lshd"><span id="apxLovTtl">Settings · الإعدادات</span><button type="button" id="apxLovX">×</button></div><div class="apx-theme-box"><div class="apx-theme-lbl" id="apxThemeLbl">المظهر · Theme</div><div class="apx-seg"><button type="button" id="apxSegLight">'+SUN+'<span>فاتح</span></button><button type="button" id="apxSegDark">'+MOON+'<span>داكن</span></button></div></div><div class="apx-lsrch"><input id="apxLovSearch" type="text" placeholder="Search · بحث"></div><div class="apx-llist" id="apxLovList"></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closePicker();});
  document.getElementById('apxLovX').onclick=closePicker;
  document.getElementById('apxLovSearch').addEventListener('input',renderList);
  document.getElementById('apxSegLight').onclick=function(){applyTheme('light');};
  document.getElementById('apxSegDark').onclick=function(){applyTheme('dark');};
  bindSettings();
  updateCtrl();
}

function updateCtrl(){
  var bt=document.getElementById('apxThemeBtn');
  if(bt)bt.innerHTML=(curTheme==='light')?MOON:SUN;
  var sl=document.getElementById('apxSegLight'),sd=document.getElementById('apxSegDark');
  if(sl)sl.className=(curTheme==='light')?'on':'';
  if(sd)sd.className=(curTheme==='dark')?'on':'';
}

/* ربط عنصر "الإعدادات" في القوائم بفتح نافذة الإعدادات (مظهر + لغة) */
function bindSettings(){
  var els=document.querySelectorAll('[data-i18n="settings"]');
  [].forEach.call(els,function(el){
    var t=el.closest?(el.closest('a,button,li,.menu-item,[role="button"]')||el):el;
    if(t.__apxSettingsBound)return;t.__apxSettingsBound=true;
    t.addEventListener('click',function(){openPicker();});
    if(t.style)t.style.cursor='pointer';
  });
}

function renderList(){
  var box=document.getElementById('apxLovList');if(!box)return;
  var q=((document.getElementById('apxLovSearch')||{}).value||'').trim().toLowerCase();
  var html=LANGS.filter(function(l){return !q||l.n.toLowerCase().indexOf(q)>=0||l.e.toLowerCase().indexOf(q)>=0||l.c.indexOf(q)>=0;}).map(function(l){
    var sel=l.c===curLang;
    return '<div class="apx-lrow'+(sel?' sel':'')+'" data-c="'+l.c+'"><span class="fl">'+l.f+'</span><div class="ln"><b>'+l.n+'</b><span>'+l.e+'</span></div><span class="tk">✓</span></div>';
  }).join('');
  box.innerHTML=html||'<div style="padding:20px;text-align:center;color:#7a8794">—</div>';
  [].forEach.call(box.querySelectorAll('.apx-lrow'),function(r){r.onclick=function(){pick(r.getAttribute('data-c'));};});
}
function openPicker(){var ov=document.getElementById('apxLov');if(!ov)return;renderList();ov.classList.add('on');var s=document.getElementById('apxLovSearch');if(s){s.value='';}}
function closePicker(){var ov=document.getElementById('apxLov');if(ov)ov.classList.remove('on');}
function pick(c){apply(c);renderList();setTimeout(closePicker,220);}

/* مراقب لترجمة المحتوى المُضاف ديناميكياً */
function startObserver(){
  if(!window.MutationObserver||!document.body)return;
  var mo=new MutationObserver(function(muts){
    if(_busy)return;_busy=true;
    try{
      muts.forEach(function(m){
        if(m.type!=='childList')return;
        [].forEach.call(m.addedNodes,function(nn){
          if(nn.nodeType===1){applyToRoot(nn,curLang);}
          else if(nn.nodeType===3){walkText(nn,curLang);}
        });
      });
    }finally{setTimeout(function(){_busy=false;},0);}
  });
  mo.observe(document.body,{childList:true,subtree:true});
}

window.APEX_I18N={apply:apply,t:function(k){return keyT(curLang,k);},langs:LANGS,current:function(){return curLang;},setTheme:applyTheme,toggleTheme:toggleTheme,theme:function(){return curTheme;},open:openPicker,openSettings:openPicker};

function boot(){
  document.documentElement.setAttribute('data-theme',curTheme);
  injectStyle();
  buildCtrl();
  apply(curLang);
  startObserver();
}
/* تطبيق المظهر فوراً لتجنّب ومضة الألوان */
document.documentElement.setAttribute('data-theme',curTheme);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

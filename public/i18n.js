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
}};
var PH={ar:{searchPh:'بحث عن عملة (BTC، ETH)...',searchCoin:'ابحث عن عملة...'},en:{searchPh:'Search a coin (BTC, ETH)...',searchCoin:'Search a coin...'}};
var SRC={en:{
  "Apex — تحويل":"Apex — Convert",
  "إلى عملة":"To coin",
  "السجل ›":"History ›",
  "القيمة التقديرية":"Estimated value",
  "تأكيد التحويل":"Confirm transfer",
  "تحويل (تحويل عملة)":"Convert (coin swap)",
  "رصيد":"Balance",
  "ستستلم":"You will receive",
  "سعر التحويل":"Conversion rate",
  "من عملة":"From coin",
  "CryptoSphere Pro - محفظة الأصول":"CryptoSphere Pro - Asset Wallet",
  "إجمالي الأصول المتاحة":"Total available assets",
  "إدارة الأصول والمحفظة 💰":"Asset and wallet management 💰",
  "الأصول":"Assets",
  "الدعم":"Support",
  "سجل المعاملات والأرباح":"Transactions and earnings history",
  "Apex — سحب":"Apex — Withdraw",
  "أدخل عنوان المحفظة":"Enter wallet address",
  "الرصيد المتاح":"Available balance",
  "الرصيد والسحب يُداران على السيرفر. كل حساب له رصيده المستقل، ويُخصم المبلغ من رصيد السيرفر بعد التحقق.":"Balance and withdrawals are managed on the server. Each account has its own independent balance, and the amount is deducted from the server balance after verification.",
  "عنوان السحب (شبكة تجريبية)":"Withdrawal address (test network)",
  "name@example.com أو رقم الهاتف":"name@example.com or phone number",
  "أدخل بياناتك للبدء في التداول فوراً":"Enter your details to start trading instantly",
  "أو المتابعة باستخدام":"Or continue with",
  "أوافق على":"I agree to",
  "إنشاء الحساب الشخصي":"Create personal account",
  "إنشاء حساب جديد - Apex Crypto Official":"Create new account - Apex Crypto Official",
  "إنشاء حساب مجاني":"Create free account",
  "ابدأ رحلة الاستثمار الرقمي مع":"Start your digital investment journey with",
  "اتصال مشفر وآمن 256-bit SSL":"Encrypted and secure 256-bit SSL connection",
  "البريد الإلكتروني / رقم الهاتف":"Email / phone number",
  "الخاصة بمنصة Apex.":"of the Apex platform.",
  "الخصوصية":"Privacy",
  "الشروط والأحكام":"Terms and Conditions",
  "المساعدة":"Help",
  "جميع الحقوق محفوظة © 2026 Apex Crypto Global":"All rights reserved © 2026 Apex Crypto Global",
  "دعم كامل لمختلف العملات الرقمية والأصول المشفرة بأقل رسوم.":"Full support for various cryptocurrencies and digital assets with the lowest fees.",
  "سجل الآن واحصل على حزمة المكافآت الترحيبية، وتداول بأمان تام مع سيولة لحظية وتنفيذ فائق السرعة للصفقات على مدار الساعة.":"Register now and get the welcome bonus package, and trade in complete safety with instant liquidity and ultra-fast order execution around the clock.",
  "سياسة الخصوصية":"Privacy Policy",
  "شروط الخدمة":"Terms of Service",
  "صندوق حماية احتياطي بقيمة مليار دولار وأمان متكامل للأصول.":"A one-billion-dollar reserve protection fund and complete asset security.",
  "فريق مختص لمساعدتك في عمليات الإيداع والسحب والتداول.":"A dedicated team to help you with deposits, withdrawals and trading.",
  "كلمة المرور":"Password",
  "لديك حساب بالفعل؟":"Already have an account?",
  "محرك مطابقة أودرات متطور يستوعب ملايين الصفقات في الثانية.":"An advanced order-matching engine handling millions of trades per second.",
  "معرف الإحالة (اختياري)":"Referral ID (optional)",
  "و":"and",
  "⚡ تنفيذ لحظي فوري":"⚡ Instant execution",
  "🌐 دعم فني 24/7":"🌐 24/7 technical support",
  "💼 محافظ متعددة":"💼 Multiple wallets",
  "🔥 انضم لأسرع منصة تداول نمواً في الشرق الأوسط":"🔥 Join the fastest-growing trading platform in the Middle East",
  "🛡️ أعلى معايير الأمان":"🛡️ Highest security standards",
  "8 أحرف على الأقل":"At least 8 characters",
  "Apex — الرئيسية":"Apex — Home",
  "بحث عن عملة":"Search a coin",
  "تم استلام وثيقتك وهي قيد المراجعة.":"Your document was received and is under review.",
  "حسابك قيد المراجعة من الإدارة":"Your account is under review by the administration",
  "عنوان السحب":"Withdrawal address",
  "فريق الدعم":"Support team",
  "فعّل المصادقة الثنائية 2FA ورمز مكافحة التصيد من قسم الأمان.":"Enable 2FA and the anti-phishing code from the Security section.",
  "مثال: Apex-2024":"Example: Apex-2024",
  "مستخدم":"User",
  "مسح":"Scan",
  "مسح رمز QR":"Scan QR code",
  "وجّه الكاميرا نحو رمز QR لعنوان السحب — سيظهر العنوان فور التقاطه":"Point the camera at the withdrawal address QR code — the address will appear once captured",
  "• متصل — نردّ عادة خلال دقائق":"• Online — we usually reply within minutes",
  "▲ الأعلى ربحاً":"▲ Top Gainers",
  "▼ الأعلى خسارة":"▼ Top Losers",
  "★ المفضلات":"★ Favorites",
  "✓ تمّ مسح العنوان بنجاح":"✓ Address scanned successfully",
  "✨ جديدة":"✨ New",
  "🔥 رائج":"🔥 Trending",
  "Apex — الأسواق":"Apex — Markets",
  "آخر سعر":"Last price",
  "الاسم":"Name",
  "التمويل التقليدي":"Traditional finance",
  "الحجم":"Volume",
  "الخيارات":"Options",
  "توقع":"Forecast",
  "Apex — المحفظة":"Apex — Wallet",
  "السجلات":"Logs",
  "السحوبات":"Withdrawals",
  "القيمة الإجمالية المقدرة":"Total estimated value",
  "المتاح: 0.00 USDT":"Available: 0.00 USDT",
  "المحفظة الفورية":"Spot wallet",
  "النظام":"System",
  "تبديل الاتجاه":"Swap direction",
  "تحويل داخلي بين المحفظتين":"Internal transfer between wallets",
  "تصدير":"Export",
  "تصدير CSV":"Export CSV",
  "تعليم الكل كمقروء":"Mark all as read",
  "تفاصيل العملية":"Transaction details",
  "تفعيل":"Enable",
  "رجوع":"Back",
  "رصيد العقود الآجلة":"Futures balance",
  "سجل الإشعارات":"Notifications log",
  "غير المقروءة":"Unread",
  "فعّل إشعارات المتصفّح لتصلك تنبيهات الأسعار لحظياً.":"Enable browser notifications to receive price alerts instantly.",
  "فورية":"Spot",
  "محفظة منفصلة عن الفوري":"Wallet separate from spot",
  "من":"From",
  "نظرة عامة":"Overview",
  "Apex — العقود الآجلة":"Apex — Futures",
  "السجل":"History",
  "الصفقات":"Positions",
  "المحجوز في الصفقات (هامش)":"Reserved in positions (margin)",
  "الهامش (Margin)":"Margin",
  "انسخ أفضل المتداولين تلقائياً — مثل Binance":"Copy the best traders automatically — like Binance",
  "بيع / هبوط":"Sell / Short",
  "تأكيد الإغلاق":"Confirm close",
  "تكبير الشارت":"Enlarge chart",
  "جارٍ البحث…":"Searching…",
  "حد (Limit)":"Limit",
  "حد الخسارة (Stop Loss) — السعر":"Stop Loss — price",
  "حد الربح (Take Profit) — السعر":"Take Profit — price",
  "حد الربح وحد الخسارة":"Take Profit / Stop Loss",
  "سجل التحويلات":"Transfers history",
  "سعر التصفية التقريبي":"Approx. liquidation price",
  "سعر التنفيذ (Limit)":"Execution price (Limit)",
  "سوق (Market)":"Market",
  "شراء / صعود":"Buy / Long",
  "ضبط الرافعة المالية":"Adjust leverage",
  "طلبات البيع":"Sell orders",
  "طلبات الشراء":"Buy orders",
  "نسخ التداول 🔥":"Copy Trading 🔥",
  "… تحميل الرسم البياني":"… loading chart",
  "$42م+":"$42M+",
  "128ك+":"128K+",
  "Apex — نسخ التداول":"Apex — Copy Trading",
  "أفضل المتداولين":"Top traders",
  "اختر متداولاً ناجحاً وستُنسخ صفقاته على حسابك آلياً بنفس النسبة — تماماً مثل نظام Binance Copy Trading.":"Choose a successful trader and their trades will be copied to your account automatically at the same ratio — just like Binance Copy Trading.",
  "الأعلى عائداً":"Highest return",
  "الأكبر إدارة":"Largest AUM",
  "الأكثر متابعة":"Most followed",
  "تحت الإدارة":"Under management",
  "لوحة الأداء":"Performance board",
  "متوسط النجاح":"Average win rate",
  "ناسخ":"Copier",
  "نسبة النجاح":"Win rate",
  "نسخ التداول":"Copy Trading",
  "نسخي":"My copies",
  "🔥 انسخِ المحترفين تلقائياً":"🔥 Copy the pros automatically",
  "🚀 قدّم طلباً لتصبح متداولاً يُنسخ":"🚀 Apply to become a copied trader",
  "أضف تعليقاً...":"Add a comment...",
  "إضافة صورة":"Add image",
  "ابحث في الأخبار والمنشورات...":"Search news and posts...",
  "الأحدث":"Latest",
  "التعليقات":"Comments",
  "شارك خبراً أو تحليلاً أو رأيك في السوق... استخدم $BTC لذكر عملة":"Share news, analysis or your market view... use $BTC to mention a coin",
  "منشور جديد":"New post",
  "منشوراتي":"My posts",
  "نشر":"Post",
  "📰 الأخبار":"📰 News",
  "🔥 الرائج":"🔥 Trending",
  ") — يشتري ويبيع تلقائياً ضمن نطاق سعري محدد. حدّد النطاق الأعلى والأدنى وعدد الشبكات.":") — buys and sells automatically within a set price range. Define the upper and lower range and the number of grids.",
  "Apex — التداول":"Apex — Trade",
  "السعر الأدنى":"Lowest price",
  "السعر الأعلى":"Highest price",
  "السعر الحالي:":"Current price:",
  "السعر المستهدف":"Target price",
  "الطلبات المفتوحة":"Open orders",
  "الطلبات المفتوحة (":"Open orders (",
  "العمليات":"Operations",
  "المعلومات":"Info",
  "بوتات":"Bots",
  "بوتات التداول الآلي — قريباً":"Automated trading bots — coming soon",
  "بيع/شراء":"Sell/Buy",
  "تأكيد الشراء":"Confirm buy",
  "تحليل التداول":"Trading analysis",
  "تحليل الزخم · 70 شراء مفرط / 30 بيع مفرط":"Momentum analysis · 70 overbought / 30 oversold",
  "تحليل لحظي للعملة":"Live coin analysis",
  "تحميل الرسم...":"Loading chart...",
  "تحويل العملة":"Convert coin",
  "تفعيل التنبيه":"Enable alert",
  "توقّع":"Forecast",
  "جارٍ تحميل معلومات العملة…":"Loading coin info…",
  "جني الأرباح":"Take Profit",
  "جني الأرباح / إيقاف الخسارة":"Take Profit / Stop Loss",
  "حوّل الأموال إلى محفظتك الفورية للتداول ›":"Transfer funds to your spot wallet to trade ›",
  "خط أفقي":"Horizontal line",
  "خط اتجاه":"Trend line",
  "طلب مُجزّأ":"Scaled order",
  "فوري (Spot)":"Spot",
  "فيبوناتشي":"Fibonacci",
  "قائمة الطلب":"Order book",
  "مجتمع Square للأخبار والمنشورات — قيد الإعداد وسيُفعّل قريباً.":"Square community for news and posts — under construction, coming soon.",
  "مخطط الطلبات":"Depth chart",
  "مركز المساعدة":"Help center",
  "مساعد APX الذكي":"APX Smart Assistant",
  "معلمات التداول":"Trading parameters",
  "نطاق تلقائي ±٪10":"Auto range ±10%",
  "نمط التداول":"Trading mode",
  "وضع تجريبي مفعّل — تتداول برصيد افتراضي (لا تأثير على رصيدك الحقيقي)":"Demo mode enabled — you trade with virtual balance (no effect on your real balance)",
  "يساوي =":"Equals =",
  "🔔 تنبيه سعر":"🔔 Price alert",
  "أدخل بيانات حسابك للمتابعة":"Enter your account details to continue",
  "تسجيل الدخول — Apex":"Sign in — Apex",
  "دخول":"Sign in",
  "ليس لديك حساب؟":"Don't have an account?",
'آخر تسجيل دخول':'Last login',
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
}};

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
   'html[data-theme="light"]{--bg:#f4f6f9;--card:#ffffff;--card2:#eef1f5;--line:#e5e9ef;--txt:#1b2026;--mut:#6b7686;--yellow:#b8860b;--panel:#ffffff;--panel2:#eef1f5;--border:#e5e9ef;--muted:#6b7686;--gold1:#d9a406;--gold2:#b8860b;--green:#0ba360;--red:#e23b52;}',
   'html[data-theme="light"] body{background:var(--bg);color:var(--txt);}',
   'html[data-theme="light"] .apx-ctrl .apx-cbtn{background:#fff;border-color:#e5e9ef;color:#1b2026;box-shadow:0 2px 10px rgba(0,0,0,.08)}',
   '.apx-ctrl{position:fixed;inset-inline-start:12px;bottom:74px;z-index:99990;display:flex;flex-direction:column;gap:8px}',
   '.apx-ctrl .apx-cbtn{width:42px;height:42px;border-radius:50%;border:1px solid var(--line,#1f2731);background:var(--card,#12161c);color:var(--txt,#eaecef);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:0}',
   '.apx-ctrl .apx-cbtn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}',
   '.apx-ctrl .apx-cbtn:active{transform:scale(.92)}',
   '.apx-lov{position:fixed;inset:0;z-index:99991;background:rgba(0,0,0,.55);display:none;align-items:flex-end;justify-content:center}',
   '.apx-lov.on{display:flex}',
   '.apx-lsheet{width:100%;max-width:460px;max-height:80vh;background:var(--card,#12161c);color:var(--txt,#eaecef);border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.4)}',
   '.apx-lshd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line,#1f2731);font-weight:800}',
   '.apx-lshd button{margin-inline-start:auto;background:none;border:none;color:var(--mut,#848e9c);font-size:22px;cursor:pointer;line-height:1}',
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
  ov.innerHTML='<div class="apx-lsheet"><div class="apx-lshd"><span id="apxLovTtl">Language · اللغة</span><button type="button" id="apxLovX">×</button></div><div class="apx-lsrch"><input id="apxLovSearch" type="text" placeholder="Search · بحث"></div><div class="apx-llist" id="apxLovList"></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)closePicker();});
  document.getElementById('apxLovX').onclick=closePicker;
  document.getElementById('apxLovSearch').addEventListener('input',renderList);
  updateCtrl();
}

function updateCtrl(){
  var bt=document.getElementById('apxThemeBtn');
  if(bt)bt.innerHTML=(curTheme==='light')?MOON:SUN;
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

window.APEX_I18N={apply:apply,t:function(k){return keyT(curLang,k);},langs:LANGS,current:function(){return curLang;},setTheme:applyTheme,toggleTheme:toggleTheme,theme:function(){return curTheme;},open:openPicker};

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

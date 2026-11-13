const mysql = require('mysql2');

// الاتصال بقاعدة بيانات Aiven السحابية مباشرة
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'اسم_الهوست_الخاص_بـ_Aiven',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'كلمة_مرور_Aiven',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 13247 // استبدل برقم البورت الخاص بـ Aiven
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to Aiven MySQL database:', err);
        return;
    }
    console.log('Connected to Aiven MySQL database successfully.');
});

module.exports = db;
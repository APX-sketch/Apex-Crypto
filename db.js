const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // اكتب كلمة المرور الخاصة بقاعدة البيانات إن وجدت
    database: 'apex_crypto_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database apex_crypto_db successfully.');
});

module.exports = db;
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../Src/config/dbConfig');
require('../Src/modules/AccountingCode/Model/AccountingCodeModel');

(async () => {
    await connectDB();
    const AC = mongoose.model('AccountingCode');
    const results = await AC.find({
        $or: [
            { code: '1.1.03' },
            { name: /receivable/i },
            { category: /receivable/i },
            { accountType: /receivable/i }
        ]
    }).limit(5);
    results.forEach(r => {
        console.log(`ID: ${r._id}, Code: ${r.code}, Name: ${r.name}, Category: ${r.category}, Type: ${r.accountType}`);
    });
    if (results.length === 0) {
        console.log('No AR code found, listing first 10 codes:');
        const all = await AC.find({}).limit(10).sort({ code: 1 });
        all.forEach(r => console.log(`  ${r.code} - ${r.name} (${r.category})`));
    }
    process.exit(0);
})();

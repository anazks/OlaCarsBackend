
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function listCodes() {
    try {
        await mongoose.connect(MONGO_URI);
        const AccountingCode = mongoose.model('AccountingCode', new mongoose.Schema({ code: String, name: String, category: String }));
        const codes = await AccountingCode.find({});
        console.log('Accounting Codes:');
        codes.forEach(c => console.log(`- ${c.code}: ${c.name} (${c.category})`));
        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

listCodes();

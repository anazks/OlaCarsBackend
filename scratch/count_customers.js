const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/olacars";

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        const Customer = mongoose.model('Customer', new mongoose.Schema({}, { strict: false }));
        const count = await Customer.countDocuments({ isDeleted: false });
        console.log(`Total active customers in DB: ${count}`);
        
        console.time('fetch_all');
        const all = await Customer.find({ isDeleted: false });
        console.timeEnd('fetch_all');
        console.log(`Fetched ${all.length} customers. Size in memory estimate: roughly ${JSON.stringify(all).length / 1024 / 1024} MB.`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();

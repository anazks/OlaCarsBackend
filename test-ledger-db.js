const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function test() {
    console.log('Connecting to Mongo URI:', mongoUri);
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB!');
        
        const LedgerSchema = new mongoose.Schema({}, { strict: false, collection: 'ledgerentries' });
        const LedgerEntry = mongoose.model('LedgerEntryTest', LedgerSchema);
        
        const total = await LedgerEntry.countDocuments();
        console.log('Total ledger entries in database:', total);
        
        const entries = await LedgerEntry.find({}).limit(10).lean();
        console.log('--- Sample Ledger Entries ---');
        entries.forEach(e => {
            console.log(`ID: ${e._id}, Amount: ${e.amount}, Type: ${e.type}, Date: ${e.entryDate || e.createdAt}`);
        });
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

test();

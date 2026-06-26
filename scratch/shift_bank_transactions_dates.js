const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function run() {
    console.log('Connecting to database...');
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        // Reference BankTransaction Model
        require('../Src/shared/constants/roles'); // ensure roles constant is loaded if needed
        const BankTransaction = require('../Src/modules/BankAccount/Model/BankTransactionModel');

        const transactions = await BankTransaction.find({});
        console.log(`Found ${transactions.length} bank transactions to update.`);

        let updatedCount = 0;
        for (const tx of transactions) {
            if (tx.entryDate) {
                const oldDate = new Date(tx.entryDate);
                const newDate = new Date(oldDate.getTime() + 24 * 60 * 60 * 1000);
                
                await BankTransaction.updateOne(
                    { _id: tx._id },
                    { $set: { entryDate: newDate } }
                );
                
                console.log(`Updated transaction ID: ${tx.transactionId || tx._id} | Date: ${oldDate.toISOString()} -> ${newDate.toISOString()}`);
                updatedCount++;
            }
        }

        console.log(`Migration completed successfully! Updated ${updatedCount} transactions.`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

run();

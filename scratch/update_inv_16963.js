const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function main() {
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected to MongoDB.');

        const db = mongoose.connection.db;
        const invoicesCol = db.collection('invoices');
        const ledgerCol = db.collection('ledgerentries');

        const inv = await invoicesCol.findOne({ invoiceNumber: "INV-16963" });

        if (!inv) {
            console.error('Invoice INV-16963 not found in database!');
            return;
        }

        console.log('\n--- Current Document State ---');
        console.log(`_id: ${inv._id}`);
        console.log(`invoiceNumber: ${inv.invoiceNumber}`);
        console.log(`status: ${inv.status}`);
        console.log(`totalAmountDue: ${inv.totalAmountDue}`);
        console.log(`amountPaid: ${inv.amountPaid}`);
        console.log(`balance: ${inv.balance}`);
        console.log(`payments: ${JSON.stringify(inv.payments)}`);

        const now = new Date();
        const paymentRecord = {
            amount: 40,
            paidAt: now,
            paymentMethod: "Cash",
            note: "Partial payment recorded per user request"
        };

        const updateRes = await invoicesCol.updateOne(
            { _id: inv._id },
            {
                $set: {
                    status: "OVERDUE",
                    amountPaid: 40,
                    balance: 240,
                    payments: [paymentRecord],
                    updatedAt: now
                },
                $unset: {
                    paidAt: ""
                }
            }
        );

        console.log(`\nUpdate Result: matched ${updateRes.matchedCount}, modified ${updateRes.modifiedCount}`);

        // Verify ledger entries count (must be 0)
        const ledgerCount = await ledgerCol.countDocuments({
            description: new RegExp("INV-16963", 'i')
        });

        // Fetch updated document
        const updatedInv = await invoicesCol.findOne({ _id: inv._id });
        console.log('\n--- Updated Document State ---');
        console.log(`_id: ${updatedInv._id}`);
        console.log(`invoiceNumber: ${updatedInv.invoiceNumber}`);
        console.log(`status: ${updatedInv.status}`);
        console.log(`totalAmountDue: ${updatedInv.totalAmountDue}`);
        console.log(`amountPaid: ${updatedInv.amountPaid}`);
        console.log(`balance: ${updatedInv.balance}`);
        console.log(`payments: ${JSON.stringify(updatedInv.payments, null, 2)}`);
        console.log(`paidAt: ${updatedInv.paidAt}`);
        console.log(`Connected Ledger Entries: ${ledgerCount}`);

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

main();

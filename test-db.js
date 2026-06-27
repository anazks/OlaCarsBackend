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
        
        // Define minimal Invoice schema
        const InvoiceSchema = new mongoose.Schema({
            invoiceNumber: String,
            amountPaid: Number,
            totalAmountDue: Number,
            balance: Number,
            generatedAt: Date,
            dueDate: Date,
            status: String,
            isDeleted: { type: Boolean, default: false }
        }, { collection: 'invoices' });
        
        const Invoice = mongoose.model('InvoiceTest', InvoiceSchema);
        
        const total = await Invoice.countDocuments();
        console.log('Total invoices in database:', total);
        
        const active = await Invoice.countDocuments({ isDeleted: false });
        console.log('Total non-deleted invoices:', active);
        
        const invoices = await Invoice.find({ isDeleted: false }).lean();
        console.log('--- List of non-deleted Invoices ---');
        invoices.forEach(inv => {
            console.log(`Number: ${inv.invoiceNumber}, Status: ${inv.status}, GeneratedAt: ${inv.generatedAt?.toISOString()}, DueDate: ${inv.dueDate?.toISOString()}, Paid: ${inv.amountPaid}, Total: ${inv.totalAmountDue}, Balance: ${inv.balance}`);
        });
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

test();

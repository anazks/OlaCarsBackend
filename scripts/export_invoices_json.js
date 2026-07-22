const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');

async function backupInvoices() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(mongoUri.trim());
        console.log('Connected successfully!');

        console.log('Fetching all invoices from database...');
        const startTime = Date.now();
        const invoices = await Invoice.find({}).lean();
        console.log(`Fetched ${invoices.length} invoices in ${((Date.now() - startTime) / 1000).toFixed(2)} seconds.`);

        const dateStr = new Date().toISOString().split('T')[0];
        const outputFilename = `invoices_backup_${dateStr}.json`;
        const outputPath = path.join(__dirname, '..', outputFilename);

        console.log(`Writing invoice backup to JSON file: ${outputPath}...`);
        const jsonContent = JSON.stringify(invoices, null, 2);
        fs.writeFileSync(outputPath, jsonContent, 'utf8');

        const stats = fs.statSync(outputPath);
        const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`Backup completed successfully!`);
        console.log(`File: ${outputPath}`);
        console.log(`Total Invoices Exported: ${invoices.length}`);
        console.log(`Backup File Size: ${fileSizeInMB} MB`);

    } catch (err) {
        console.error('Error backing up invoices:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

backupInvoices();

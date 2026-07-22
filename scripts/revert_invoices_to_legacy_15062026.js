const path = require('path');
const workspaceDir = 'c:\\Users\\anton\\OneDrive\\Documents\\vs coding\\OlaCarsBackend';

const XLSX = require(path.join(workspaceDir, 'node_modules', 'xlsx'));
const mongoose = require(path.join(workspaceDir, 'node_modules', 'mongoose'));
const dotenv = require(path.join(workspaceDir, 'node_modules', 'dotenv'));

dotenv.config({ path: path.join(workspaceDir, '.env') });

const { Invoice } = require(path.join(workspaceDir, 'Src', 'modules', 'Invoice', 'Model', 'InvoiceModel'));

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0';

async function runMigration() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri.trim());
    console.log('Connected successfully!');

    const excelPath = path.join(workspaceDir, 'AR Aging Details By Invoice Date 15-06-2026.xlsx');
    console.log(`Reading legacy AR Aging spreadsheet: ${excelPath}`);
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`Total rows in Excel sheet: ${rows.length}`);

    console.log('Fetching active invoices from database...');
    const dbInvoices = await Invoice.find({
        isDeleted: false
    }).select('_id invoiceNumber totalAmountDue amountPaid balance status payments').lean();

    console.log(`Loaded ${dbInvoices.length} invoices from database for matching.`);

    const dbMapExact = new Map();
    const dbMapUpper = new Map();

    dbInvoices.forEach(inv => {
        if (inv.invoiceNumber) {
            dbMapExact.set(inv.invoiceNumber.trim(), inv);
            dbMapUpper.set(inv.invoiceNumber.trim().toUpperCase(), inv);
        }
    });

    const bulkOps = [];
    let matchedCount = 0;
    let notFoundCount = 0;

    for (const r of rows) {
        const invNum = String(r.invoice_number || '').trim();
        if (!invNum) continue;

        let dbInv = dbMapExact.get(invNum) || dbMapUpper.get(invNum.toUpperCase());

        if (!dbInv) {
            // Vehicle plate code fallback (e.g., EM4330, EQ9041)
            const matchCode = invNum.match(/([A-Z]{2}\d{4})/i);
            if (matchCode) {
                const code = matchCode[1].toUpperCase();
                dbInv = dbInvoices.find(i => i.invoiceNumber && i.invoiceNumber.toUpperCase().includes(code));
            }
        }

        if (dbInv) {
            matchedCount++;

            const excelAmount = Number(r.amount || 0);
            const excelBalance = Number(r.balance || 0);
            const excelPaid = Math.max(0, Math.round((excelAmount - excelBalance) * 100) / 100);
            const targetStatus = excelBalance === 0 ? "PAID" : "OVERDUE";

            bulkOps.push({
                updateOne: {
                    filter: { _id: dbInv._id },
                    update: {
                        $set: {
                            balance: excelBalance,
                            amountPaid: excelPaid,
                            status: targetStatus,
                            payments: []
                        }
                    }
                }
            });
        } else {
            notFoundCount++;
            console.warn(`[WARNING] Could not match invoice number: "${invNum}"`);
        }
    }

    console.log(`\nMatch Summary:`);
    console.log(`- Matched Invoices: ${matchedCount} / ${rows.length}`);
    console.log(`- Not Found Invoices: ${notFoundCount}`);
    console.log(`- Prepared Bulk Database Operations: ${bulkOps.length}`);

    if (bulkOps.length > 0) {
        console.log('\nExecuting bulk updates in MongoDB...');
        const startTime = Date.now();
        const result = await Invoice.bulkWrite(bulkOps);
        console.log(`Bulk write completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s.`);
        console.log(`Modified count: ${result.modifiedCount}`);
        console.log(`Matched count in DB: ${result.matchedCount}`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Migration completed successfully.');
}

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const { InventoryPart } = require("../Src/modules/Inventory/Model/InventoryPartModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const LedgerService = require("../Src/modules/Ledger/Service/LedgerService");

const runTest = async () => {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("Connected to Database.");

    try {
        // 1. Get or Create active Branch
        let branch = await Branch.findOne({ isDeleted: false });
        if (!branch) {
            branch = await Branch.create({
                name: "Test Branch",
                code: "TSTB",
                address: "123 Main St",
                city: "Test City",
                state: "Test State",
                phone: "1234567890",
                country: "Test Country",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }

        // 2. Get or Create a test customer
        let customer = await Customer.findOne({ name: "Test Inventory Ledger Cust" });
        if (!customer) {
            customer = await Customer.create({
                name: "Test Inventory Ledger Cust",
                customerId: "CUST-INV-LEDG-1",
                email: "cust-inv-ledger@example.com",
                phone: "9876543210",
                branch: branch._id,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }

        // 3. Find accounting codes
        const arCode = await AccountingCode.findOne({ code: "1.1.03" });
        const salesCode = await AccountingCode.findOne({ code: "IN0010" });
        const cogsCode = await AccountingCode.findOne({ code: "CGS0001" });
        const invAssetCode = await AccountingCode.findOne({ code: "INV0001" });

        console.log(`AR Code ID: ${arCode?._id} (${arCode?.code})`);
        console.log(`Sales Code ID: ${salesCode?._id} (${salesCode?.code})`);
        console.log(`COGS Code ID: ${cogsCode?._id} (${cogsCode?.code})`);
        console.log(`Inventory Asset ID: ${invAssetCode?._id} (${invAssetCode?.code})`);

        if (!arCode || !salesCode || !cogsCode || !invAssetCode) {
            throw new Error("Missing required accounting codes!");
        }

        // 4. Create a test inventory part
        // Delete first to avoid duplicates
        await InventoryPart.deleteMany({ partNumber: "TEST-PART-LEDG-1" });
        const part = await InventoryPart.create({
            partName: "Test Part Ledger",
            partNumber: "TEST-PART-LEDG-1",
            category: "Engine",
            unitCost: 40.00, // COGS cost is $40.00
            quantityOnHand: 10,
            branchId: branch._id,
            inventoryAccountId: invAssetCode._id,
            purchaseAccountId: cogsCode._id,
            incomeAccountId: salesCode._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });
        console.log(`Created test inventory part: ${part.partName} with unit cost: $${part.unitCost}`);

        // 5. Create manual invoice containing this part
        // Sales price is $100.00, quantity is 2 (total sale $200.00)
        // Expected COGS is $80.00
        const invoiceData = {
            invoiceNumber: `INV-TST-${Date.now()}`,
            customer: customer._id,
            invoiceType: "MANUAL",
            invoiceDate: new Date(),
            dueDate: new Date(),
            baseAmount: 200,
            subtotal: 200,
            taxAmount: 0,
            totalAmountDue: 200,
            balance: 200,
            lineItems: [
                {
                    name: part.partName,
                    qty: 2,
                    unitPrice: 100,
                    total: 200,
                    inventoryPart: part._id
                }
            ],
            status: "PENDING",
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        };

        const invoice = await Invoice.create(invoiceData);
        console.log(`Created manual invoice: ${invoice.invoiceNumber}`);

        // 6. Generate ledger entries
        console.log("Generating ledger entries...");
        await LedgerService.generateInvoiceLedgerEntries(invoice);

        // 7. Verify ledger entries
        const entries = await LedgerEntry.find({ description: new RegExp(invoice.invoiceNumber) })
            .populate("accountingCode");
        console.log(`\nFound ${entries.length} ledger entries:`);
        
        let hasAR = false;
        let hasSales = false;
        let hasCOGS = false;
        let hasInvAsset = false;

        for (const entry of entries) {
            const code = entry.accountingCode.code;
            console.log(`Account: ${code} (${entry.accountingCode.name}) | Type: ${entry.type} | Amount: $${entry.amount}`);
            
            if (code === "1.1.03") {
                if (entry.type !== "DEBIT" || entry.amount !== 200) {
                    throw new Error("Incorrect AR posting!");
                }
                hasAR = true;
            }
            if (code === "IN0010") {
                if (entry.type !== "CREDIT" || entry.amount !== 200) {
                    throw new Error("Incorrect Sales posting!");
                }
                hasSales = true;
            }
            if (code === "CGS0001") {
                if (entry.type !== "DEBIT" || entry.amount !== 80) {
                    throw new Error(`Incorrect COGS posting! Expected DEBIT $80, got ${entry.type} $${entry.amount}`);
                }
                hasCOGS = true;
            }
            if (code === "INV0001") {
                if (entry.type !== "CREDIT" || entry.amount !== 80) {
                    throw new Error(`Incorrect Inventory Asset posting! Expected CREDIT $80, got ${entry.type} $${entry.amount}`);
                }
                hasInvAsset = true;
            }
        }

        if (!hasAR) throw new Error("Missing AR ledger entry!");
        if (!hasSales) throw new Error("Missing Sales ledger entry!");
        if (!hasCOGS) throw new Error("Missing COGS/Purchase ledger entry!");
        if (!hasInvAsset) throw new Error("Missing Inventory Asset ledger entry!");

        console.log("\n✅ ALL POSTING CHECKS PASSED!");

        // Clean up
        console.log("Cleaning up test documents...");
        await Invoice.deleteOne({ _id: invoice._id });
        await LedgerEntry.deleteMany({ description: new RegExp(invoice.invoiceNumber) });
        await InventoryPart.deleteOne({ _id: part._id });
        await Customer.deleteOne({ _id: customer._id });
        console.log("Cleanup complete.");

    } catch (err) {
        console.error("❌ TEST FAILED:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Database disconnected.");
    }
};

runTest();

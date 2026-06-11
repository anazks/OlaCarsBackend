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
        let customer = await Customer.findOne({ name: "Test Consolidate Ledger Cust" });
        if (!customer) {
            customer = await Customer.create({
                name: "Test Consolidate Ledger Cust",
                customerId: "CUST-CONSOL-LEDG",
                email: "cust-consol-ledger@example.com",
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

        if (!arCode || !salesCode || !cogsCode || !invAssetCode) {
            throw new Error("Missing required accounting codes!");
        }

        // 4. Create two test inventory parts sharing the same accounts
        await InventoryPart.deleteMany({ partNumber: { $in: ["TEST-PART-CONSOL-1", "TEST-PART-CONSOL-2"] } });
        
        const part1 = await InventoryPart.create({
            partName: "Test Part Consol 1",
            partNumber: "TEST-PART-CONSOL-1",
            category: "Engine",
            unitCost: 40.00, // COGS cost is 2 * 40 = $80
            quantityOnHand: 10,
            branchId: branch._id,
            inventoryAccountId: invAssetCode._id,
            purchaseAccountId: cogsCode._id,
            incomeAccountId: salesCode._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });

        const part2 = await InventoryPart.create({
            partName: "Test Part Consol 2",
            partNumber: "TEST-PART-CONSOL-2",
            category: "Engine",
            unitCost: 20.00, // COGS cost is 3 * 20 = $60
            quantityOnHand: 15,
            branchId: branch._id,
            inventoryAccountId: invAssetCode._id,
            purchaseAccountId: cogsCode._id,
            incomeAccountId: salesCode._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });

        console.log(`Created parts: ${part1.partName} and ${part2.partName}`);

        // 5. Create manual invoice containing both parts
        // Item 1: sales price $100, qty 2 => total $200, cost $80
        // Item 2: sales price $50, qty 3 => total $150, cost $60
        // Total Base = 350. Total COGS = 140.
        const invoiceData = {
            invoiceNumber: `INV-CONSOL-${Date.now()}`,
            customer: customer._id,
            invoiceType: "MANUAL",
            invoiceDate: new Date(),
            dueDate: new Date(),
            baseAmount: 350,
            subtotal: 350,
            taxAmount: 0,
            totalAmountDue: 350,
            balance: 350,
            lineItems: [
                {
                    name: part1.partName,
                    qty: 2,
                    unitPrice: 100,
                    total: 200,
                    inventoryPart: part1._id
                },
                {
                    name: part2.partName,
                    qty: 3,
                    unitPrice: 50,
                    total: 150,
                    inventoryPart: part2._id
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
            console.log(`Account: ${code} (${entry.accountingCode.name}) | Type: ${entry.type} | Amount: $${entry.amount} | Desc: ${entry.description}`);
            
            if (code === "1.1.03") {
                if (entry.type !== "DEBIT" || entry.amount !== 350) {
                    throw new Error("Incorrect AR posting amount!");
                }
                hasAR = true;
            }
            if (code === "IN0010") {
                if (entry.type !== "CREDIT" || entry.amount !== 350) {
                    throw new Error(`Incorrect Sales posting amount! Got $${entry.amount}`);
                }
                if (!entry.description.includes("Test Part Consol 1") || !entry.description.includes("Test Part Consol 2")) {
                    throw new Error("Consolidated sales description should include all items!");
                }
                hasSales = true;
            }
            if (code === "CGS0001") {
                if (entry.type !== "DEBIT" || entry.amount !== 140) {
                    throw new Error(`Incorrect COGS posting! Expected DEBIT $140, got ${entry.type} $${entry.amount}`);
                }
                if (!entry.description.includes("Test Part Consol 1") || !entry.description.includes("Test Part Consol 2")) {
                    throw new Error("Consolidated COGS description should include all items!");
                }
                hasCOGS = true;
            }
            if (code === "INV0001") {
                if (entry.type !== "CREDIT" || entry.amount !== 140) {
                    throw new Error(`Incorrect Inventory Asset posting! Expected CREDIT $140, got ${entry.type} $${entry.amount}`);
                }
                if (!entry.description.includes("Test Part Consol 1") || !entry.description.includes("Test Part Consol 2")) {
                    throw new Error("Consolidated Inventory Asset description should include all items!");
                }
                hasInvAsset = true;
            }
        }

        if (entries.length !== 4) {
            throw new Error(`Expected exactly 4 ledger entries (consolidated), but got ${entries.length}!`);
        }

        if (!hasAR) throw new Error("Missing AR ledger entry!");
        if (!hasSales) throw new Error("Missing Sales ledger entry!");
        if (!hasCOGS) throw new Error("Missing COGS/Purchase ledger entry!");
        if (!hasInvAsset) throw new Error("Missing Inventory Asset ledger entry!");

        console.log("\n✅ ALL POSTING CONSOLIDATION CHECKS PASSED!");

        // Clean up
        console.log("Cleaning up test documents...");
        await Invoice.deleteOne({ _id: invoice._id });
        await LedgerEntry.deleteMany({ description: new RegExp(invoice.invoiceNumber) });
        await InventoryPart.deleteOne({ _id: part1._id });
        await InventoryPart.deleteOne({ _id: part2._id });
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

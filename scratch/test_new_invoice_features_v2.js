const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Tax = require("../Src/modules/Tax/Model/TaxModel");
const Customer = require("../Src/modules/Customer/Model/CustomerModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const { InventoryPart } = require("../Src/modules/Inventory/Model/InventoryPartModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
require("../Src/modules/BranchManager/Model/BranchManagerModel");
require("../Src/modules/CountryManager/Model/CountryManagerModel");
const InvoiceService = require("../Src/modules/Invoice/Service/InvoiceService");
const LedgerService = require("../Src/modules/Ledger/Service/LedgerService");

const runTests = async () => {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("Connected to Database.");

    // Clean up
    await Invoice.deleteMany({ invoiceNumber: /INV-TEST/ });
    await LedgerEntry.deleteMany({ description: /INV-TEST/ });

    try {
        // Find branch
        let branch = await Branch.findOne({ isDeleted: false });
        if (!branch) {
            branch = await Branch.create({
                name: "Test Branch V2",
                code: "TSTV2",
                address: "123 Main St",
                city: "Test City",
                state: "Test State",
                phone: "1234567890",
                country: "Test Country",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }

        // Find or create customer
        let customer = await Customer.findOne({ name: "Test Customer V2" });
        if (!customer) {
            customer = await Customer.create({
                name: "Test Customer V2",
                customerId: "CUST-TEST-V2",
                email: "customer-test-v2@example.com",
                phone: "123456789",
                branch: branch._id,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }

        // Find or create tax
        let tax = await Tax.findOne({ name: "Tax 7% Test", isDeleted: false });
        if (!tax) {
            tax = await Tax.create({
                name: "Tax 7% Test",
                rate: 7,
                isActive: true,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
        }

        // Find custom revenue accounting codes
        const arAccount = await AccountingCode.findOne({ code: "1.1.03" })
            || await AccountingCode.findOne({ code: "1100" });
        const salesAccount = await AccountingCode.findOne({ code: "IN0010" });
        const customPartSalesAccount = await AccountingCode.findOne({ code: "IN0002" }); // Let's use Rental Income code IN0002 as the custom parts account to verify it's routed correctly
        const taxAccount = await AccountingCode.findOne({ code: "2.1.04" })
            || await AccountingCode.findOne({ name: /Tax Payable 7%/i });

        if (!arAccount || !salesAccount || !customPartSalesAccount || !taxAccount) {
            throw new Error(`Required accounting codes not found: AR=${!!arAccount}, Sales=${!!salesAccount}, PartSales=${!!customPartSalesAccount}, Tax=${!!taxAccount}`);
        }

        // Create inventory part
        const part = await InventoryPart.create({
            partName: "Test Brake Pads",
            partNumber: "PART-TEST-V2-" + Date.now(),
            category: "Brakes",
            unit: "piece",
            unitCost: 50,
            quantityOnHand: 10,
            branchId: branch._id,
            salesAccount: customPartSalesAccount._id,
            createdBy: new mongoose.Types.ObjectId(),
            creatorRole: "ADMIN"
        });
        console.log("Created inventory part with custom sales account:", part.partName);

        // -------------------------------------------------------------
        // CASE 1: Tax Exclusive Invoice (Exclude Tax)
        // -------------------------------------------------------------
        console.log("\n--- Testing Tax Exclusive Invoice (Exclude Tax) ---");
        const invoiceDataExclusive = {
            customer: customer._id,
            dueDate: new Date(),
            invoiceDate: new Date(),
            weekLabel: "Tax Exclusive Test",
            isTaxInclusive: false,
            lineItems: [
                {
                    name: part.partName,
                    qty: 1,
                    unitPrice: 100,
                    inventoryPart: part._id
                },
                {
                    name: "Custom Oil Filter",
                    qty: 1,
                    unitPrice: 50
                }
            ],
            tax: tax._id,
            notes: "Exclusive tax test"
        };

        const invoiceEx = await InvoiceService.createManualInvoice(
            invoiceDataExclusive,
            new mongoose.Types.ObjectId(),
            "ADMIN"
        );

        // Subtotal = 100 + 50 = 150
        // Base Amount = 150
        // Tax = 150 * 0.07 = 10.5
        // Total Due = 160.5
        console.log("Invoice Ex:", invoiceEx.invoiceNumber);
        console.log("Subtotal:", invoiceEx.subtotal);
        console.log("BaseAmount:", invoiceEx.baseAmount);
        console.log("TaxAmount:", invoiceEx.taxAmount);
        console.log("TotalAmountDue:", invoiceEx.totalAmountDue);

        if (invoiceEx.subtotal !== 150) throw new Error("Subtotal should be 150");
        if (invoiceEx.baseAmount !== 150) throw new Error("BaseAmount should be 150");
        if (invoiceEx.taxAmount !== 10.50) throw new Error("TaxAmount should be 10.50");
        if (invoiceEx.totalAmountDue !== 160.50) throw new Error("TotalAmountDue should be 160.50");

        // Verify Ledger Entries
        console.log("Verifying Ledger Entries for Tax Exclusive Invoice...");
        const entriesEx = await LedgerEntry.find({ description: new RegExp(invoiceEx.invoiceNumber) }).populate("accountingCode");
        console.log(`Found ${entriesEx.length} entries:`);
        let drAr = 0, crSales = 0, crCustomPart = 0, crTax = 0;
        for (const entry of entriesEx) {
            console.log(`- ${entry.type} | Account: ${entry.accountingCode.code} - ${entry.accountingCode.name} | Amount: ${entry.amount} | Description: ${entry.description}`);
            if (entry.type === "DEBIT" && String(entry.accountingCode._id) === String(arAccount._id)) {
                drAr += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(salesAccount._id)) {
                crSales += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(customPartSalesAccount._id)) {
                crCustomPart += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(taxAccount._id)) {
                crTax += entry.amount;
            }
        }

        // Expected Leg amounts:
        // DR AR: 160.50
        // CR Sales (custom oil filter): 50
        // CR Custom Part (Test Brake Pads): 100
        // CR Tax: 10.50
        if (drAr !== 160.50) throw new Error(`Expected DR AR to be 160.50 but got ${drAr}`);
        if (crSales !== 50.00) throw new Error(`Expected CR Sales to be 50.00 but got ${crSales}`);
        if (crCustomPart !== 100.00) throw new Error(`Expected CR CustomPart (IN0002) to be 100.00 but got ${crCustomPart}`);
        if (crTax !== 10.50) throw new Error(`Expected CR Tax to be 10.50 but got ${crTax}`);
        console.log("✅ Tax Exclusive Ledger verification passed!");

        // -------------------------------------------------------------
        // CASE 2: Tax Inclusive Invoice (Include Tax)
        // -------------------------------------------------------------
        console.log("\n--- Testing Tax Inclusive Invoice (Include Tax) ---");
        const invoiceDataInclusive = {
            customer: customer._id,
            dueDate: new Date(),
            invoiceDate: new Date(),
            weekLabel: "Tax Inclusive Test",
            isTaxInclusive: true,
            lineItems: [
                {
                    name: part.partName,
                    qty: 1,
                    unitPrice: 100,
                    inventoryPart: part._id
                },
                {
                    name: "Custom Oil Filter",
                    qty: 1,
                    unitPrice: 50
                }
            ],
            tax: tax._id,
            notes: "Inclusive tax test"
        };

        const invoiceIn = await InvoiceService.createManualInvoice(
            invoiceDataInclusive,
            new mongoose.Types.ObjectId(),
            "ADMIN"
        );

        // Subtotal = 100 + 50 = 150
        // Total Due = 150
        // Base Amount = 150 / 1.07 = 140.19
        // Tax = 150 - 140.19 = 9.81
        console.log("Invoice In:", invoiceIn.invoiceNumber);
        console.log("Subtotal:", invoiceIn.subtotal);
        console.log("BaseAmount:", invoiceIn.baseAmount);
        console.log("TaxAmount:", invoiceIn.taxAmount);
        console.log("TotalAmountDue:", invoiceIn.totalAmountDue);

        if (invoiceIn.subtotal !== 150) throw new Error("Subtotal should be 150");
        if (invoiceIn.totalAmountDue !== 150) throw new Error("TotalAmountDue should be 150");
        if (invoiceIn.baseAmount !== 140.19) throw new Error("BaseAmount should be 140.19");
        if (invoiceIn.taxAmount !== 9.81) throw new Error("TaxAmount should be 9.81");

        // Verify Ledger Entries
        console.log("Verifying Ledger Entries for Tax Inclusive Invoice...");
        const entriesIn = await LedgerEntry.find({ description: new RegExp(invoiceIn.invoiceNumber) }).populate("accountingCode");
        console.log(`Found ${entriesIn.length} entries:`);
        drAr = 0; crSales = 0; crCustomPart = 0; crTax = 0;
        for (const entry of entriesIn) {
            console.log(`- ${entry.type} | Account: ${entry.accountingCode.code} - ${entry.accountingCode.name} | Amount: ${entry.amount} | Description: ${entry.description}`);
            if (entry.type === "DEBIT" && String(entry.accountingCode._id) === String(arAccount._id)) {
                drAr += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(salesAccount._id)) {
                crSales += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(customPartSalesAccount._id)) {
                crCustomPart += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(taxAccount._id)) {
                crTax += entry.amount;
            }
        }

        // Expected prorated Leg amounts:
        // DR AR: 150.00
        // Total Base = 140.19
        // Custom Oil Filter portion: Math.round(50 * (140.19 / 150)) = 46.73
        // Test Brake Pads portion: 140.19 - 46.73 = 93.46
        // CR Sales: 46.73
        // CR Custom Part: 93.46
        // CR Tax: 9.81
        // Sum of CR = 46.73 + 93.46 + 9.81 = 150.00. Perfect!
        if (drAr !== 150.00) throw new Error(`Expected DR AR to be 150.00 but got ${drAr}`);
        if (crSales !== 46.73) throw new Error(`Expected CR Sales to be 46.73 but got ${crSales}`);
        if (crCustomPart !== 93.46) throw new Error(`Expected CR CustomPart to be 93.46 but got ${crCustomPart}`);
        if (crTax !== 9.81) throw new Error(`Expected CR Tax to be 9.81 but got ${crTax}`);
        console.log("✅ Tax Inclusive Ledger verification passed!");

        // -------------------------------------------------------------
        // CASE 3: Manual Invoice with "No Tax" (Explicitly selected)
        // -------------------------------------------------------------
        console.log("\n--- Testing Manual Invoice with No Tax ---");
        const invoiceDataNoTax = {
            customer: customer._id,
            dueDate: new Date(),
            invoiceDate: new Date(),
            weekLabel: "No Tax Test",
            isTaxInclusive: false,
            lineItems: [
                {
                    name: "Consulting Service",
                    qty: 1,
                    unitPrice: 200
                }
            ],
            tax: undefined, // Explicitly no tax
            notes: "No tax test"
        };

        const invoiceNoTax = await InvoiceService.createManualInvoice(
            invoiceDataNoTax,
            new mongoose.Types.ObjectId(),
            "ADMIN"
        );

        console.log("Invoice NoTax:", invoiceNoTax.invoiceNumber);
        console.log("Subtotal:", invoiceNoTax.subtotal);
        console.log("BaseAmount:", invoiceNoTax.baseAmount);
        console.log("TaxAmount:", invoiceNoTax.taxAmount);
        console.log("TotalAmountDue:", invoiceNoTax.totalAmountDue);

        if (invoiceNoTax.subtotal !== 200) throw new Error("Subtotal should be 200");
        if (invoiceNoTax.baseAmount !== 200) throw new Error("BaseAmount should be 200");
        if (invoiceNoTax.taxAmount !== 0) throw new Error("TaxAmount should be 0");
        if (invoiceNoTax.totalAmountDue !== 200) throw new Error("TotalAmountDue should be 200");

        // Verify Ledger Entries
        console.log("Verifying Ledger Entries for No Tax Invoice...");
        const entriesNoTax = await LedgerEntry.find({ description: new RegExp(invoiceNoTax.invoiceNumber) }).populate("accountingCode");
        console.log(`Found ${entriesNoTax.length} entries:`);
        drAr = 0; crSales = 0; crTax = 0;
        for (const entry of entriesNoTax) {
            console.log(`- ${entry.type} | Account: ${entry.accountingCode.code} - ${entry.accountingCode.name} | Amount: ${entry.amount} | Description: ${entry.description}`);
            if (entry.type === "DEBIT" && String(entry.accountingCode._id) === String(arAccount._id)) {
                drAr += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(salesAccount._id)) {
                crSales += entry.amount;
            } else if (entry.type === "CREDIT" && String(entry.accountingCode._id) === String(taxAccount._id)) {
                crTax += entry.amount;
            }
        }

        if (drAr !== 200) throw new Error(`Expected DR AR to be 200 but got ${drAr}`);
        if (crSales !== 200) throw new Error(`Expected CR Sales to be 200 but got ${crSales}`);
        if (crTax !== 0) throw new Error(`Expected CR Tax to be 0 but got ${crTax}`);
        if (entriesNoTax.length !== 2) throw new Error(`Expected exactly 2 entries, but got ${entriesNoTax.length}`);
        console.log("✅ No Tax Ledger verification passed!");

        // Clean up created documents
        console.log("\nCleaning up test documents...");
        await Invoice.deleteMany({ customer: customer._id });
        await LedgerEntry.deleteMany({ description: /INV-TEST/ });
        await InventoryPart.deleteOne({ _id: part._id });
        await Customer.deleteOne({ _id: customer._id });
        console.log("Cleanup complete.");

        console.log("\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!");

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Database disconnected.");
    }
};

runTests();

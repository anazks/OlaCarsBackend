const mongoose = require("mongoose");
const connectDB = require("../Src/config/dbConfig");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");
const Tax = require("../Src/modules/Tax/Model/TaxModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const LedgerEntry = require("../Src/modules/Ledger/Model/LedgerEntryModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
require("../Src/modules/BranchManager/Model/BranchManagerModel");
require("../Src/modules/CountryManager/Model/CountryManagerModel");
const InvoiceService = require("../Src/modules/Invoice/Service/InvoiceService");
const InvoiceCronService = require("../Src/modules/Invoice/Service/InvoiceCronService");
const LedgerService = require("../Src/modules/Ledger/Service/LedgerService");

const runTests = async () => {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("Connected to Database.");

    // Clean up any leaked test data from crashed runs
    await Invoice.deleteMany({ invoiceNumber: /INV-0000/ });
    await LedgerEntry.deleteMany({ description: /INV-0000/ });

    try {
        // 0. Get or Create active Branch
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
            console.log("Created test branch:", branch.name);
        } else {
            console.log("Using existing branch:", branch.name);
        }

        // 1. Get or Create active Tax
        let tax = await Tax.findOne({ name: "VAT Test", isDeleted: false });
        if (!tax) {
            tax = await Tax.create({
                name: "VAT Test",
                rate: 15,
                isActive: true,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created test tax: VAT Test (15%)");
        } else {
            console.log(`Using existing test tax: ${tax.name} (${tax.rate}%)`);
        }

        // Ensure it is active and rate is 15
        tax.isActive = true;
        tax.rate = 15;
        await tax.save();

        // 2. Get or Create a test driver
        let driver = await Driver.findOne({ "personalInfo.email": "test-driver@example.com" });
        if (!driver) {
            driver = await Driver.create({
                driverId: "DRV-TEST-99",
                personalInfo: {
                    fullName: "Test Driver TaxCalc",
                    email: "test-driver@example.com",
                    phone: "1234567890"
                },
                branch: branch._id,
                rentTracking: [
                    {
                        weekNumber: 999,
                        weekLabel: "Week 999 - Rent Test",
                        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
                        amount: 200,
                        status: "PENDING"
                    }
                ],
                status: "ACTIVE",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created test driver:", driver.driverId);
        } else {
            console.log("Using existing test driver:", driver.driverId);
            // Refresh tracking
            driver.status = "ACTIVE";
            driver.rentTracking = [
                {
                    weekNumber: 999,
                    weekLabel: "Week 999 - Rent Test",
                    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
                    amount: 200,
                    status: "PENDING"
                }
            ];
            await driver.save();
        }

        // 3. Get or Create a test vehicle
        let vehicle = await Vehicle.findOne({ plateNumber: "TEST-TAX-1" });
        if (!vehicle) {
            vehicle = await Vehicle.create({
                plateNumber: "TEST-TAX-1",
                basicDetails: {
                    fleetNumber: "FLT-TAX-1",
                    make: "Toyota",
                    model: "Prius"
                },
                purchaseDetails: {
                    branch: branch._id
                },
                status: "ACTIVE — AVAILABLE",
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created test vehicle:", vehicle.plateNumber);
        } else {
            console.log("Using existing test vehicle:", vehicle.plateNumber);
        }

        // Assign vehicle to driver
        driver.currentVehicle = vehicle._id;
        await driver.save();

        // Get or Create a test customer
        const CustomerModel = require("../Src/modules/Customer/Model/CustomerModel");
        let customer = await CustomerModel.findOne({ email: "test-customer@example.com" });
        if (!customer) {
            customer = await CustomerModel.create({
                name: "Test Customer TaxCalc",
                customerId: "CUST-TEST-99",
                email: "test-customer@example.com",
                phone: "1234567890",
                branch: branch._id,
                driver: driver._id,
                createdBy: new mongoose.Types.ObjectId(),
                creatorRole: "ADMIN"
            });
            console.log("Created test customer:", customer.name);
        } else {
            customer.driver = driver._id;
            await customer.save();
            console.log("Using existing test customer:", customer.name);
        }

        // 4. Test Manual Invoice Creation with selected Tax
        console.log("\n--- Testing createManualInvoice with selected Tax ---");
        const manualInvoiceData = {
            customer: customer._id,
            driver: driver._id,
            vehicle: vehicle._id,
            dueDate: new Date(),
            invoiceDate: new Date(),
            weekLabel: "Manual Test Tax Week",
            lineItems: [
                {
                    name: "Base Lease Rate",
                    description: "Weekly rent",
                    qty: 1,
                    unitPrice: 100
                },
                {
                    name: "Extra Service Charge",
                    qty: 2,
                    unitPrice: 50
                }
            ],
            discountType: "FIXED",
            discountValue: 0,
            tax: tax._id,
            notes: "Testing manual invoice creation tax logic"
        };

        const manualInv = await InvoiceService.createManualInvoice(
            manualInvoiceData,
            new mongoose.Types.ObjectId(),
            "ADMIN"
        );

        console.log("Manual Invoice Created successfully.");
        console.log("Invoice Number:", manualInv.invoiceNumber);
        console.log("Subtotal (line items: 100 + 2*50):", manualInv.subtotal);
        console.log("Base Amount (before tax):", manualInv.baseAmount);
        console.log("Tax Amount (15% of 200):", manualInv.taxAmount);
        console.log("Tax Rate:", manualInv.taxRate);
        console.log("Total Amount Due (200 + 30):", manualInv.totalAmountDue);
        console.log("Tax Ref:", manualInv.tax);

        // Assertions
        if (manualInv.subtotal !== 200) throw new Error("Assertion failed: subtotal should be 200");
        if (manualInv.baseAmount !== 200) throw new Error("Assertion failed: baseAmount should be 200");
        if (manualInv.taxAmount !== 30) throw new Error("Assertion failed: taxAmount should be 30");
        if (manualInv.totalAmountDue !== 230) throw new Error("Assertion failed: totalAmountDue should be 230");
        if (String(manualInv.tax) !== String(tax._id)) throw new Error("Assertion failed: tax reference incorrect");
        if (!manualInv.invoiceNumber.match(/^INV-\d{6}$/)) throw new Error("Assertion failed: invoiceNumber format should be INV-XXXXXX");

        console.log("All manual invoice field assertions passed!");

        // 5. Verify Ledger Entries for Manual Invoice
        console.log("\n--- Verifying Ledger entries for Manual Invoice (including double-call protection) ---");
        
        // Call it a second time to simulate double ledger creation/booking trigger
        await LedgerService.generateInvoiceLedgerEntries(manualInv);

        const ledgerEntries = await LedgerEntry.find({ description: new RegExp(manualInv.invoiceNumber) });
        console.log(`Found ${ledgerEntries.length} ledger entries for ${manualInv.invoiceNumber}:`);
        
        let totalDebits = 0;
        let totalCredits = 0;
        for (const entry of ledgerEntries) {
            console.log(`- Type: ${entry.type}, Account: ${entry.accountingCode}, Amount: ${entry.amount}`);
            if (entry.type === "DEBIT") {
                totalDebits += entry.amount;
            } else {
                totalCredits += entry.amount;
            }
        }
        
        if (totalDebits !== 230) {
            throw new Error(`Assertion failed: Total debits should be 230, got ${totalDebits}`);
        }
        if (totalCredits !== 230) {
            throw new Error(`Assertion failed: Total credits should be 230, got ${totalCredits}`);
        }
        if (ledgerEntries.length !== 3) {
            throw new Error(`Assertion failed: Should find EXACTLY 3 ledger entries (consolidated sales & tax) but got ${ledgerEntries.length} (double booking guard failed)`);
        }
        console.log("Ledger entry verification passed! Balanced double-entry verified and no duplicate booking occurred.");

        // 6. Test Weekly Invoice Auto-creation via Cron simulation
        console.log("\n--- Testing generateCurrentWeekInvoices (Cron) ---");
        
        // Find existing invoices for the driver to get the start count
        const invoicesBefore = await Invoice.find({ driver: driver._id, isDeleted: false });
        console.log(`Invoices before weekly generation: ${invoicesBefore.length}`);

        const cronResult = await InvoiceCronService.generateCurrentWeekInvoices(true, new mongoose.Types.ObjectId(), "ADMIN");
        console.log("Weekly generation result:", cronResult);

        // Find the newly created weekly invoice
        const newlyCreated = await Invoice.findOne({ 
            driver: driver._id, 
            weekNumber: 999,
            isDeleted: false 
        });

        if (!newlyCreated) {
            throw new Error("Assertion failed: Weekly invoice was not created");
        }
        console.log("Weekly Invoice Created successfully.");
        console.log("Invoice Number:", newlyCreated.invoiceNumber);
        console.log("Base Amount (before tax):", newlyCreated.baseAmount);
        console.log("Tax Rate Applied:", newlyCreated.taxRate);
        console.log("Tax Amount:", newlyCreated.taxAmount);
        console.log("Carry Over Amount:", newlyCreated.carryOverAmount);
        console.log("Total Amount Due:", newlyCreated.totalAmountDue);
        console.log("Tax Ref:", newlyCreated.tax);

        // Assertions
        const expectedTotalDue = Math.round((newlyCreated.baseAmount + newlyCreated.taxAmount + newlyCreated.carryOverAmount) * 100) / 100;

        if (Math.round((newlyCreated.baseAmount + newlyCreated.taxAmount) * 100) / 100 !== 200) {
            throw new Error(`Assertion failed: baseAmount + taxAmount should be 200, got ${newlyCreated.baseAmount + newlyCreated.taxAmount}`);
        }
        if (newlyCreated.totalAmountDue !== expectedTotalDue) throw new Error(`Assertion failed: totalAmountDue should be ${expectedTotalDue}`);
        if (!newlyCreated.invoiceNumber.match(/^INV-\d{6}$/)) throw new Error("Assertion failed: invoiceNumber format should be INV-XXXXXX");

        console.log("All weekly invoice field assertions passed!");

        // 7. Verify Ledger Entries for Weekly Invoice
        console.log("\n--- Verifying Ledger entries for Weekly Invoice ---");
        const weeklyLedgerEntries = await LedgerEntry.find({ description: new RegExp(newlyCreated.invoiceNumber) });
        console.log(`Found ${weeklyLedgerEntries.length} ledger entries for ${newlyCreated.invoiceNumber}:`);
        
        let weeklyDebits = 0;
        let weeklyCredits = 0;
        for (const entry of weeklyLedgerEntries) {
            console.log(`- Type: ${entry.type}, Account: ${entry.accountingCode}, Amount: ${entry.amount}`);
            if (entry.type === "DEBIT") {
                weeklyDebits += entry.amount;
            } else {
                weeklyCredits += entry.amount;
            }
        }
        
        const expectedCurrentPeriodTotal = Math.round((newlyCreated.baseAmount + newlyCreated.taxAmount) * 100) / 100;
        if (Math.round(weeklyDebits * 100) / 100 !== expectedCurrentPeriodTotal) {
            throw new Error(`Assertion failed: Weekly debits should equal current period total (${expectedCurrentPeriodTotal}), got ${weeklyDebits}`);
        }
        if (Math.round(weeklyCredits * 100) / 100 !== expectedCurrentPeriodTotal) {
            throw new Error(`Assertion failed: Weekly credits should equal current period total (${expectedCurrentPeriodTotal}), got ${weeklyCredits}`);
        }
        if (weeklyLedgerEntries.length !== 3) {
            throw new Error(`Assertion failed: Should find exactly 3 ledger entries (debit, credit, tax credit) but got ${weeklyLedgerEntries.length}`);
        }
        console.log("Weekly Ledger entry verification passed! Balanced double-entry verified without double-booking carryovers.");

        // 8. Test Draft Invoice Bypass and Recalculation on Tax Rate edit
        console.log("\n--- Testing Draft Invoice Bypass & Recalculation ---");
        const draftInvoiceData = {
            driver: driver._id,
            vehicle: vehicle._id,
            dueDate: new Date(),
            invoiceDate: new Date(),
            weekLabel: "Draft Invoice Recalc Test",
            lineItems: [
                {
                    name: "Base Lease Rate",
                    qty: 1,
                    unitPrice: 100
                }
            ],
            discountType: "FIXED",
            discountValue: 0,
            tax: tax._id,
            status: "DRAFT",
            notes: "Draft invoice"
        };

        const draftInv = await InvoiceService.createManualInvoice(
            draftInvoiceData,
            new mongoose.Types.ObjectId(),
            "ADMIN"
        );

        console.log("Draft Invoice Created successfully.");
        console.log("Invoice Number:", draftInv.invoiceNumber);
        console.log("Status:", draftInv.status);

        // Verify no ledger entries are created for DRAFT
        const draftLedger = await LedgerEntry.find({ description: new RegExp(draftInv.invoiceNumber) });
        if (draftLedger.length > 0) {
            throw new Error(`Assertion failed: Draft invoice should NOT generate ledger entries but found ${draftLedger.length}!`);
        }
        console.log("Draft Invoice Ledger Bypass verified (0 entries created).");

        // Transition Draft to PENDING and verify ledger entries are created
        console.log("Issuing Draft Invoice to PENDING...");
        const issuedInv = await InvoiceService.updateInvoice(draftInv._id, { status: "PENDING" });
        console.log("Status after issue:", issuedInv.status);
        const issuedLedger = await LedgerEntry.find({ description: new RegExp(draftInv.invoiceNumber) });
        if (issuedLedger.length !== 3) {
            throw new Error(`Assertion failed: Issued invoice should generate 3 ledger entries but found ${issuedLedger.length}!`);
        }
        console.log("Issued Invoice Ledger creation verified (3 entries created).");

        // Recalculate tax: change tax rate and trigger recalculation
        console.log("Modifying Tax rate from 15% to 10% and triggering recalculation...");
        const TaxService = require("../Src/modules/Tax/Service/TaxService");
        await TaxService.update(tax._id, { rate: 10 });

        // Retrieve the updated invoice
        const updatedIssuedInv = await Invoice.findById(draftInv._id);
        console.log("Recalculated Tax Rate:", updatedIssuedInv.taxRate);
        console.log("Recalculated Tax Amount (10% of 100):", updatedIssuedInv.taxAmount);
        console.log("Recalculated Total Amount Due (100 + 10):", updatedIssuedInv.totalAmountDue);

        if (updatedIssuedInv.taxRate !== 10) throw new Error("Recalc failed: taxRate should be 10");
        if (updatedIssuedInv.taxAmount !== 10) throw new Error("Recalc failed: taxAmount should be 10");
        if (updatedIssuedInv.totalAmountDue !== 110) throw new Error("Recalc failed: totalAmountDue should be 110");
        
        // Check new ledger entry amounts
        const recalculatedLedger = await LedgerEntry.find({ description: new RegExp(draftInv.invoiceNumber) });
        console.log(`Found ${recalculatedLedger.length} ledger entries for recalculated invoice ${draftInv.invoiceNumber}:`);
        
        let recalcDebits = 0;
        let recalcCredits = 0;
        for (const entry of recalculatedLedger) {
            console.log(`- Type: ${entry.type}, Account: ${entry.accountingCode}, Amount: ${entry.amount}`);
            if (entry.type === "DEBIT") {
                recalcDebits += entry.amount;
            } else {
                recalcCredits += entry.amount;
            }
        }
        
        if (recalcDebits !== 110) {
            throw new Error(`Assertion failed: Recalculated total debits should be 110, got ${recalcDebits}`);
        }
        if (recalcCredits !== 110) {
            throw new Error(`Assertion failed: Recalculated total credits should be 110, got ${recalcCredits}`);
        }
        if (recalculatedLedger.length !== 3) {
            throw new Error(`Assertion failed: Recalculated ledger entries should still be exactly 3 but got ${recalculatedLedger.length}`);
        }
        console.log("Recalculation and Ledger regeneration verified successfully!");

        // 9. Clean up created documents
        console.log("\nCleaning up test documents...");
        await Invoice.deleteMany({ driver: driver._id });
        await LedgerEntry.deleteMany({ description: new RegExp(manualInv.invoiceNumber) });
        await LedgerEntry.deleteMany({ description: new RegExp(newlyCreated.invoiceNumber) });
        await LedgerEntry.deleteMany({ description: new RegExp(draftInv.invoiceNumber) });
        await Driver.deleteOne({ _id: driver._id });
        await Vehicle.deleteOne({ _id: vehicle._id });
        await CustomerModel.deleteOne({ _id: customer._id });
        // Only delete the test tax if we created it
        if (String(tax._id) === String(manualInv.tax)) {
            await Tax.deleteOne({ _id: tax._id });
        }
        console.log("Cleanup complete.");

        console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Database disconnected.");
    }
};

runTests();

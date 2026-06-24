require('dotenv').config({path: '../.env'});
const mongoose = require('mongoose');
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');
const { Invoice } = require('../Src/modules/Invoice/Model/InvoiceModel');
const Tax = require('../Src/modules/Tax/Model/TaxModel');
const LedgerEntry = require('../Src/modules/Ledger/Model/LedgerEntryModel');
const DriverService = require('../Src/modules/Driver/Service/DriverService');

const branchId = '69f983399807cf101fda4e5e';
const adminId = '69f5d6a29807cf101fda4498';

async function testBulkRentUpdateFlow() {
    console.log("=== STARTING BULK RENT UPDATE VERIFICATION ===");
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✓ Connected to MongoDB.");

        // Clean up previous runs
        await Vehicle.deleteMany({ 'basicDetails.vin': "TESTVIN1234567890" });
        await Driver.deleteMany({ 'driverId': "OLA-T9999" });
        await Invoice.deleteMany({ invoiceNumber: "INV-TEST-RENT-99" });

        // 1. Ensure a Tax record exists
        let activeTax = await Tax.findOne({ isActive: true, isDeleted: false });
        if (!activeTax) {
            console.log("Creating default ITBMS 7% Tax record...");
            activeTax = new Tax({
                name: "ITBMS 7%",
                rate: 7,
                isActive: true,
                isDeleted: false
            });
            await activeTax.save();
        }
        console.log(`✓ Active Tax rate is: ${activeTax.rate}%`);

        // 2. Create mock vehicle
        const mockVehicle = new Vehicle({
            basicDetails: {
                make: "Toyota",
                model: "Prius",
                year: 2020,
                vin: "TESTVIN1234567890",
                category: "Sedan",
                fuelType: "Petrol",
                transmission: "Automatic",
                weeklyRent: 0
            },
            legalDocs: {
                registrationNumber: "TEST-99-99"
            },
            purchaseDetails: {
                branch: branchId,
                purchasePrice: 20000,
                currency: '$',
                purchaseDate: new Date(),
                vendorName: 'Test Motors Ltd',
            },
            status: "ACTIVE — AVAILABLE",
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
        await mockVehicle.save();
        console.log(`✓ Mock vehicle created with initial weeklyRent = 0, VIN = TESTVIN1234567890`);

        // 3. Create mock driver with 60 rent tracking installments (weekly style)
        const rentTracking = [];
        const today = new Date();
        
        // Week 1 (PAID)
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 7);
        rentTracking.push({
            weekNumber: 1,
            weekLabel: "Week 1",
            dueDate: pastDate,
            amount: 0,
            amountPaid: 0,
            balance: 0,
            carryOver: 0,
            totalDue: 0,
            status: "PAID"
        });

        // Week 2 (PENDING Overdue)
        const overdueDate = new Date();
        overdueDate.setDate(today.getDate() - 3);
        rentTracking.push({
            weekNumber: 2,
            weekLabel: "Week 2",
            dueDate: overdueDate,
            amount: 0,
            amountPaid: 0,
            balance: 0,
            carryOver: 0,
            totalDue: 0,
            status: "PENDING"
        });

        // Week 3 to 60 (PENDING Future)
        for (let i = 3; i <= 60; i++) {
            const futureDate = new Date();
            futureDate.setDate(today.getDate() + (i - 2) * 7);
            rentTracking.push({
                weekNumber: i,
                weekLabel: `Week ${i}`,
                dueDate: futureDate,
                amount: 0,
                amountPaid: 0,
                balance: 0,
                carryOver: 0,
                totalDue: 0,
                status: "PENDING"
            });
        }

        const mockDriver = new Driver({
            personalInfo: {
                fullName: "Rent Test Driver",
                email: "rent_test_driver@test.com",
                phone: "123456789",
                address: "Test Street"
            },
            driverId: "OLA-T9999",
            status: "ACTIVE",
            assignedVehicle: mockVehicle._id,
            branch: branchId,
            createdBy: adminId,
            creatorRole: "ADMIN",
            rentTracking: rentTracking
        });
        await mockDriver.save();
        console.log(`✓ Mock driver created with ${rentTracking.length} rent tracking installments.`);

        // 4. Create pending invoice for Week 2
        const mockInvoice = new Invoice({
            invoiceNumber: "INV-TEST-RENT-99",
            driver: mockDriver._id,
            customer: new mongoose.Types.ObjectId(),
            vehicle: mockVehicle._id,
            invoiceType: "RENTAL",
            weekNumber: 2,
            baseAmount: 0,
            taxAmount: 0,
            carryOverAmount: 0,
            totalAmountDue: 0,
            balance: 0,
            amountPaid: 0,
            status: "PENDING",
            issueDate: overdueDate,
            dueDate: overdueDate,
            isDeleted: false,
            createdBy: adminId,
            creatorRole: "ADMIN"
        });
        await mockInvoice.save();
        console.log("✓ Mock Invoice created for Week 2 with totalAmountDue = 0.");

        // 5. Simulate update of vehicle basicDetails.weeklyRent manually (as done in controller)
        mockVehicle.basicDetails.weeklyRent = 150;
        await mockVehicle.save();
        console.log("✓ Vehicle basicDetails.weeklyRent updated to 150.");

        // 6. Trigger schedule recalculation
        console.log("Triggering schedule recalculation for the driver...");
        const updateResult = await DriverService.updateDriverRentScheduleForVehicle(mockDriver._id, mockVehicle._id, 150);
        console.log("✓ Recalculation response:", updateResult);

        // 7. Verify the changes
        const updatedDriver = await Driver.findById(mockDriver._id);
        const updatedInvoice = await Invoice.findById(mockInvoice._id);

        console.log("\n--- VERIFICATION RESULTS ---");
        
        let allPassed = true;

        // Assert Week 1 (PAID) was NOT modified
        const week1 = updatedDriver.rentTracking.find(w => w.weekNumber === 1);
        console.log(`Week 1 (PAID) amount: ${week1.amount} (Expected: 0)`);
        if (week1.amount === 0) {
            console.log("✓ SUCCESS: PAID installment was untouched.");
        } else {
            console.error("✗ FAILURE: PAID installment was modified!");
            allPassed = false;
        }

        // Assert Week 2 (PENDING, Overdue) was updated to 150
        const week2 = updatedDriver.rentTracking.find(w => w.weekNumber === 2);
        console.log(`Week 2 (PENDING Overdue) amount: ${week2.amount}, carryOver: ${week2.carryOver}, totalDue: ${week2.totalDue}, balance: ${week2.balance}`);
        if (week2.amount === 150 && week2.balance === 150) {
            console.log("✓ SUCCESS: Week 2 installment was updated to 150.");
        } else {
            console.error("✗ FAILURE: Week 2 installment amount was not updated correctly!");
            allPassed = false;
        }

        // Assert Week 3 (PENDING, Future) has carryOver from Week 2
        const week3 = updatedDriver.rentTracking.find(w => w.weekNumber === 3);
        console.log(`Week 3 (PENDING Future) amount: ${week3.amount}, carryOver: ${week3.carryOver}, totalDue: ${week3.totalDue}, balance: ${week3.balance}`);
        if (week3.amount === 150 && week3.carryOver === 150 && week3.totalDue === 300) {
            console.log("✓ SUCCESS: Week 3 installment correctly carried over the 150 balance from Week 2.");
        } else {
            console.error("✗ FAILURE: Week 3 carryOver calculations are incorrect!");
            allPassed = false;
        }

        // Assert Invoice for Week 2 is updated to 150
        console.log(`Week 2 Invoice Amount: ${updatedInvoice.totalAmountDue}, Base: ${updatedInvoice.baseAmount}, Tax: ${updatedInvoice.taxAmount}, Balance: ${updatedInvoice.balance}`);
        if (updatedInvoice.totalAmountDue === 150 && updatedInvoice.balance === 150) {
            console.log("✓ SUCCESS: Invoice was updated to 150.");
        } else {
            console.error("✗ FAILURE: Invoice was not updated correctly!");
            allPassed = false;
        }

        // Cleanup
        await Vehicle.findByIdAndDelete(mockVehicle._id);
        await Driver.findByIdAndDelete(mockDriver._id);
        await Invoice.findByIdAndDelete(mockInvoice._id);
        await LedgerEntry.deleteMany({
            description: new RegExp(`\\(INV:\\s*${mockInvoice.invoiceNumber}\\)`)
        });
        console.log("\n✓ Test data successfully cleaned up from database.");
        
        if (allPassed) {
            console.log("=== BULK RENT UPDATE VERIFICATION PASSED SUCCESSFULLY ===");
        } else {
            console.error("=== BULK RENT UPDATE VERIFICATION FAILED ===");
        }

    } catch (err) {
        console.error("✗ TEST FLOW ENCOUNTERED ERROR:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}

testBulkRentUpdateFlow();

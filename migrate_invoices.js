require("dotenv").config({ path: "../../.env" });
const mongoose = require("mongoose");
const connectDB = require("./Src/config/dbConfig");
const { Driver } = require("./Src/modules/Driver/Model/DriverModel");
const { Invoice } = require("./Src/modules/Invoice/Model/InvoiceModel");

async function run() {
    await connectDB();
    console.log("Connected to DB");

    const drivers = await Driver.find({ isDeleted: false, rentTracking: { $exists: true, $not: { $size: 0 } } });
    console.log(`Found ${drivers.length} drivers with rent tracking`);

    let invoicesCreated = 0;
    
    for (const driver of drivers) {
        for (const rent of driver.rentTracking) {
            // Check if invoice already exists for this week
            const existing = await Invoice.findOne({ driver: driver._id, weekNumber: rent.weekNumber });
            if (existing) continue;

            const baseAmount = rent.amount || 0;
            const carryOverAmount = rent.carryOver || 0;
            const updatedTotalDue = rent.totalDue || (baseAmount + carryOverAmount);
            const amountPaid = rent.amountPaid || 0;
            const balance = rent.balance !== undefined ? rent.balance : Math.max(0, updatedTotalDue - amountPaid);
            
            let status = "PENDING";
            if (balance <= 0) status = "PAID";
            else if (amountPaid > 0) status = "PARTIAL";
            else if (rent.dueDate && new Date(rent.dueDate) < new Date()) status = "OVERDUE";

            await Invoice.create({
                invoiceNumber: `INV-MIG-${driver._id.toString().substring(18)}-${rent.weekNumber}`,
                driver: driver._id,
                vehicle: driver.currentVehicle || null,
                weekNumber: rent.weekNumber,
                weekLabel: rent.weekLabel || `Week ${rent.weekNumber}`,
                dueDate: rent.dueDate || new Date(),
                baseAmount: baseAmount,
                carryOverAmount: carryOverAmount,
                totalAmountDue: updatedTotalDue,
                amountPaid: amountPaid,
                balance: balance,
                status: status,
                paidAt: rent.paidAt,
                payments: rent.payments || [],
                generatedAt: new Date(),
            });
            invoicesCreated++;
        }
    }
    console.log(`Successfully migrated and created ${invoicesCreated} invoices!`);
    process.exit(0);
}

run().catch(console.error);

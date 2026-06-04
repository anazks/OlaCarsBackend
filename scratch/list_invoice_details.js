const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

require("../Src/modules/Driver/Model/DriverModel");
require("../Src/modules/Vehicle/Model/VehicleModel");
const { Invoice } = require("../Src/modules/Invoice/Model/InvoiceModel");

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const invoices = await Invoice.find({ isDeleted: false });
    for (const inv of invoices) {
        console.log({
            id: inv._id,
            number: inv.invoiceNumber,
            type: inv.invoiceType,
            baseAmount: inv.baseAmount,
            subtotal: inv.subtotal,
            discountType: inv.discountType,
            discountValue: inv.discountValue,
            discountAmount: inv.discountAmount,
            taxRate: inv.taxRate,
            taxAmount: inv.taxAmount,
            totalAmountDue: inv.totalAmountDue,
            balance: inv.balance
        });
    }
    process.exit(0);
};

run();

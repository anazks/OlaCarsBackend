const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../Src/config/dbConfig");
require("../Src/modules/Invoice/Model/InvoiceModel");

(async () => {
    await connectDB();
    const Invoice = mongoose.model("Invoice");
    const count = await Invoice.countDocuments({});
    console.log(`Total invoices: ${count}`);
    process.exit(0);
})();

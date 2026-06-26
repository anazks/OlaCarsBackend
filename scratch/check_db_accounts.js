const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");

        console.log("--- SEARCHING ACCOUNTS ---");
        const targets = ["TIGGO 8 PRO", "DEPRECIATION OF VEHICLES", "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos"];
        for (const t of targets) {
            const acc = await AccountingCode.findOne({ name: { $regex: new RegExp(t.trim(), "i") }, isDeleted: false });
            console.log(`Searching for "${t}":`, acc ? `FOUND (code: ${acc.code}, name: "${acc.name}")` : "NOT FOUND");
        }

        console.log("\n--- ALL ASSET/EXPENSE ACCOUNTS IN DB ---");
        const all = await AccountingCode.find({ category: { $in: ["ASSET", "EXPENSE", "Asset", "Expense"] }, isDeleted: false }).limit(20);
        for (const a of all) {
            console.log(` - Code: ${a.code} | Name: "${a.name}" | Category: ${a.category} | Type: ${a.accountType}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();

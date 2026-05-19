const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const FinanceAdmin = require("../Src/modules/FinanceAdmin/model/FinanceAdminModel");

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB successfully");
        const admins = await FinanceAdmin.find({ isDeleted: false });
        console.log("Finance Admins found:", admins.map(a => ({ fullName: a.fullName, email: a.email })));
        mongoose.connection.close();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();

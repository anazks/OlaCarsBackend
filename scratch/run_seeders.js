const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const { seedFinancePermissions } = require("../Src/bootstrap/seedFinancePermissions");
const { seedBranchPermissions } = require("../Src/bootstrap/seedBranchPermissions");

async function runSeeders() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        console.log("Running Finance Permissions Seeder...");
        await seedFinancePermissions();
        
        console.log("Running Branch Permissions Seeder...");
        await seedBranchPermissions();

        console.log("Seeders completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Seeder error:", error);
        process.exit(1);
    }
}

runSeeders();

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const FixedAsset = require("../Src/modules/FixedAsset/Model/FixedAssetModel");
const FixedAssetService = require("../Src/modules/FixedAsset/Service/FixedAssetService");
const AccountingCode = require("../Src/modules/AccountingCode/Model/AccountingCodeModel");
const Branch = require("../Src/modules/Branch/Model/BranchModel");
const { Vehicle } = require("../Src/modules/Vehicle/Model/VehicleModel");

async function getOrCreateAccount(code, name, category, accountType) {
    let acc = await AccountingCode.findOne({ name, isDeleted: false });
    if (!acc) {
        acc = await AccountingCode.create({
            code,
            name,
            category,
            accountType,
            createdBy: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
            creatorRole: "ADMIN"
        });
        console.log(`Seeded account: "${name}"`);
    }
    return acc;
}

async function runTest() {
    try {
        console.log("Connecting to database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        // 1. Seed accounts
        console.log("Seeding accounts if not present...");
        const faAccount = await getOrCreateAccount("1200-TIGGO", "TIGGO 8 PRO", "ASSET", "fixed asset");
        const expAccount = await getOrCreateAccount("5010-VEH", "DEPRECIATION OF VEHICLES", "EXPENSE", "expense");
        const depAccount = await getOrCreateAccount("1210-VEH", "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos", "ASSET", "fixed asset");

        // 2. Seed Branch
        console.log("Seeding Panama branch if not present...");
        let branch = await Branch.findOne({ name: /panama/i, isDeleted: false });
        if (!branch) {
            branch = await Branch.create({
                name: "Panama Branch",
                code: "PANAMA",
                phone: "123456",
                createdBy: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                creatorRole: "ADMIN"
            });
            console.log("Seeded Panama Branch");
        }

        // 3. Seed Vehicle matching registration number
        console.log("Seeding matching Vehicle...");
        let vehicle = await Vehicle.findOne({ "legalDocs.registrationNumber": "ES7402" });
        if (!vehicle) {
            vehicle = await Vehicle.create({
                basicDetails: {
                    make: "Chery",
                    model: "Tiggo 8 Pro",
                    year: 2025,
                    vin: "LVTDB21B1TD013987",
                    fleetNumber: "FL-ES7402"
                },
                legalDocs: {
                    registrationNumber: "ES7402"
                },
                createdBy: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
                creatorRole: "ADMIN"
            });
            console.log("Seeded vehicle ES7402");
        }

        // Clean up any test assets from previous runs
        await FixedAsset.deleteMany({ code: { $in: ["FA-00024", "FA-00024-DUP", "FA-INVALID"] } });

        // 4. Run Import
        console.log("Running bulk import service function...");
        const rawAssets = [
            // Row 1: Valid row, should map vehicle, accounts, location, and generate schedule
            {
                "Fixed Asset Name": "ES7402",
                "Fixed Asset Number": "FA-00024",
                "Status": "Active",
                "Fixed Asset Type": "OLA CARS VEHICLES",
                "Purchase Date": "2025-08-30",
                "Purchase Value": 20467.30,
                "Purchase Quantity": 1,
                "Current Quantity": 1,
                "Depreciation Start Value": 20467.30,
                "Current Value": 17384.90,
                "Notes": "VIN: LVTDB21B1TD013987\nINV NO:  0000000859",
                "Asset Life": 60,
                "Asset Life Basis": "Months",
                "Warranty Expiry Date": "",
                "Description": "VIN: LVTDB21B1TD013987\nINV NO:  0000000859\n",
                "Serial Number": "",
                "Disposal Value": 0.00,
                "Asset Number Prefix": "FA-",
                "Asset Number Suffix": "00024",
                "Depreciation Start Date": "2025-08-30",
                "Depreciation Method": "Straight Line",
                "Computation Type": "Pro Rata",
                "Depreciation Frequency": "Monthly",
                "Depreciation Percent": 0.00,
                "Fixed Asset Account": "TIGGO 8 PRO",
                "Expense Account": "DEPRECIATION OF VEHICLES",
                "Depreciation Account": "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos",
                "Location ID": "6671277000000093092",
                "Location Name": "Head Office"
            },
            // Row 2: Duplicate check of Row 1, should be skipped
            {
                "Fixed Asset Name": "ES7402",
                "Fixed Asset Number": "FA-00024",
                "Status": "Active",
                "Fixed Asset Type": "OLA CARS VEHICLES",
                "Purchase Date": "2025-08-30",
                "Purchase Value": 20467.30,
                "Fixed Asset Account": "TIGGO 8 PRO",
                "Expense Account": "DEPRECIATION OF VEHICLES",
                "Depreciation Account": "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos",
                "Location Name": "Head Office"
            },
            // Row 3: Invalid row (missing name), should report validation error
            {
                "Fixed Asset Number": "FA-INVALID",
                "Status": "Active",
                "Purchase Date": "2025-08-30",
                "Purchase Value": 20467.30,
                "Fixed Asset Account": "TIGGO 8 PRO",
                "Expense Account": "DEPRECIATION OF VEHICLES",
                "Depreciation Account": "Acumulated Depretiacion of Vehicles/Depreciación Acumulada de Vehículos",
                "Location Name": "Head Office"
            }
        ];

        const userData = {
            id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
            role: "ADMIN"
        };

        const result = await FixedAssetService.bulkImportFixedAssets(rawAssets, userData);

        console.log("\n--- TEST RESULTS ---");
        console.log("Created assets count (expected 1):", result.created.length);
        console.log("Duplicate assets count (expected 1):", result.duplicates.length);
        console.log("Error assets count (expected 1):", result.errors.length);

        if (result.created.length > 0) {
            const asset = result.created[0];
            console.log("\nSuccessfully Imported Asset:");
            console.log("  Name:", asset.name);
            console.log("  Code:", asset.code);
            console.log("  Status:", asset.status);
            console.log("  Location:", asset.location);
            console.log("  Linked Vehicle ID:", asset.linkedVehicle ? asset.linkedVehicle.toString() : "None");
            console.log("  Useful Life (Years):", asset.usefulLifeYears);
            console.log("  Depreciation Schedule generated periods:", asset.depreciationSchedule ? asset.depreciationSchedule.length : 0);
            
            // Assertions
            if (asset.linkedVehicle && asset.linkedVehicle.toString() === vehicle._id.toString()) {
                console.log("  ✅ SUCCESS: Vehicle matched by registration number.");
            } else {
                console.error("  ❌ FAILURE: Vehicle mapping mismatch.");
            }

            if (asset.depreciationSchedule && asset.depreciationSchedule.length === 60) {
                console.log("  ✅ SUCCESS: Depreciation schedule of 60 periods precomputed.");
            } else {
                console.error("  ❌ FAILURE: Depreciation schedule periods count mismatch.");
            }

            if (asset.location === branch.name) {
                console.log("  ✅ SUCCESS: Location defaulted to Panama Branch.");
            } else {
                console.error("  ❌ FAILURE: Location fallback didn't work. Location:", asset.location);
            }
        }

        if (result.duplicates.length > 0 && result.duplicates[0].code === "FA-00024") {
            console.log("  ✅ SUCCESS: Duplicate code FA-00024 identified and skipped.");
        } else {
            console.error("  ❌ FAILURE: Duplicate skip failed.");
        }

        if (result.errors.length > 0 && result.errors[0].reason.includes("Fixed Asset Name")) {
            console.log("  ✅ SUCCESS: Validation error for missing name reported.");
        } else {
            console.error("  ❌ FAILURE: Validation checking failed.");
        }

        // Clean up
        await FixedAsset.deleteMany({ code: { $in: ["FA-00024", "FA-00024-DUP", "FA-INVALID"] } });
        console.log("\nCleanup completed.");

    } catch (err) {
        console.error("Test failed with error:", err);
    } finally {
        await mongoose.connection.close();
        console.log("Database connection closed.");
    }
}

runTest();

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const xlsxPath = path.resolve(__dirname, '../../olaCarsFrontEnd/node_modules/xlsx');
let XLSX;
try {
    XLSX = require(xlsxPath);
} catch (e) {
    console.error('Failed to load xlsx from frontend:', e.message);
    process.exit(1);
}

// Models
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');
const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

const filePath = 'C:\\Users\\anton\\Downloads\\splitExecl.xlsx';
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet);

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB.');
        console.log(`Processing ${rows.length} rows...`);

        let successCount = 0;
        let failCount = 0;
        const branchId = new mongoose.Types.ObjectId();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;

            try {
                // Validate vehicle fields
                const vehicleData = {
                    status: "ACTIVE — RENTED",
                    purchaseDetails: { branch: branchId },
                    basicDetails: {
                        make: row.vehicleMake ? String(row.vehicleMake).trim() : undefined,
                        model: row.vehicleModel ? String(row.vehicleModel).trim() : undefined,
                        year: row.vehicleYear ? Number(row.vehicleYear) : undefined,
                        category: row.vehicleCategory ? String(row.vehicleCategory).trim() : undefined,
                        fuelType: row.vehicleFuelType ? String(row.vehicleFuelType).trim() : undefined,
                        colour: row.vehicleColour ? String(row.vehicleColour).trim() : undefined,
                        vin: row.vehicleVin ? String(row.vehicleVin).trim() : undefined,
                        fleetNumber: (row.fleetNumber || row.vehicleFleetNumber || "").toString().trim() || undefined,
                    },
                    legalDocs: {
                        registrationNumber: row.vehicleNumber ? String(row.vehicleNumber).trim() : 'TEST',
                    },
                    createdBy: new mongoose.Types.ObjectId(),
                    creatorRole: 'ADMIN',
                };

                const vehicle = new Vehicle(vehicleData);
                await vehicle.validate();

                // Validate driver fields
                const driverData = {
                    status: "ACTIVE",
                    branch: branchId,
                    personalInfo: {
                        fullName: String(row.fullName || "").trim(),
                        email: row.email ? String(row.email).trim().toLowerCase() : undefined,
                        phone: row.phone ? String(row.phone).trim() : undefined,
                        whatsappNumber: row.whatsappNumber ? String(row.whatsappNumber).trim() : undefined,
                        dateOfBirth: row.dateOfBirth || undefined,
                        nationality: row.nationality ? String(row.nationality).trim() : undefined,
                    },
                    identityDocs: {
                        idType: row.idType || undefined,
                        idNumber: row.idNumber ? String(row.idNumber).trim() : undefined,
                    },
                    drivingLicense: {
                        licenseNumber: row.licenseNumber ? String(row.licenseNumber).trim() : undefined,
                        licenseCountry: row.licenseCountry ? String(row.licenseCountry).trim() : undefined,
                        expiryDate: row.licenseExpiry || undefined,
                    },
                    emergencyContact: {
                        name: row.emergencyName ? String(row.emergencyName).trim() : undefined,
                        relationship: row.emergencyRelationship ? String(row.emergencyRelationship).trim() : undefined,
                        phone: row.emergencyPhone ? String(row.emergencyPhone).trim() : undefined,
                    },
                    createdBy: new mongoose.Types.ObjectId(),
                    creatorRole: 'ADMIN',
                };

                const driver = new Driver(driverData);
                await driver.validate();

                successCount++;
            } catch (err) {
                failCount++;
                console.log(`Row ${rowNum} (${row.fullName}): Validation Error:`, err.message);
            }
        }

        console.log(`\nSimulation results: ${successCount} valid, ${failCount} invalid.`);
    } catch (e) {
        console.error('Error during run:', e);
    } finally {
        await mongoose.disconnect();
    }
}

run();

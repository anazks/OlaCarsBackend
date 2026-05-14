const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

async function seedVehicles() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const branchId = '69f983399807cf101fda4e5e';
        const adminId = '69f5d6a29807cf101fda4498';

        const vehicles = [
            {
                status: 'ACTIVE — AVAILABLE',
                purchaseDetails: {
                    branch: branchId,
                    purchasePrice: 25000,
                    currency: '$',
                    purchaseDate: new Date('2024-01-15'),
                    vendorName: 'Global Motors'
                },
                basicDetails: {
                    make: 'Toyota',
                    model: 'Corolla',
                    year: 2024,
                    category: 'Sedan',
                    fuelType: 'Petrol',
                    transmission: 'Automatic',
                    condition: 'New',
                    fleetNumber: 'V-1001',
                    vin: 'TYT1234567890COR1',
                    engineNumber: 'ENG-TYT-001',
                    colour: 'White'
                },
                createdBy: adminId,
                creatorRole: 'ADMIN'
            },
            {
                status: 'ACTIVE — AVAILABLE',
                purchaseDetails: {
                    branch: branchId,
                    purchasePrice: 45000,
                    currency: '$',
                    purchaseDate: new Date('2024-02-10'),
                    vendorName: 'Luxury Auto'
                },
                basicDetails: {
                    make: 'BMW',
                    model: 'X5',
                    year: 2024,
                    category: 'SUV',
                    fuelType: 'Diesel',
                    transmission: 'Automatic',
                    condition: 'New',
                    fleetNumber: 'V-1002',
                    vin: 'BMWX5-2024-SUV-02',
                    engineNumber: 'ENG-BMW-002',
                    colour: 'Black'
                },
                createdBy: adminId,
                creatorRole: 'ADMIN'
            },
            {
                status: 'ACTIVE — AVAILABLE',
                purchaseDetails: {
                    branch: branchId,
                    purchasePrice: 32000,
                    currency: '$',
                    purchaseDate: new Date('2024-03-01'),
                    vendorName: 'Direct Fleet'
                },
                basicDetails: {
                    make: 'Honda',
                    model: 'CR-V',
                    year: 2024,
                    category: 'SUV',
                    fuelType: 'Hybrid',
                    transmission: 'Automatic',
                    condition: 'New',
                    fleetNumber: 'V-1003',
                    vin: 'HND-CRV-HYB-003',
                    engineNumber: 'ENG-HND-003',
                    colour: 'Silver'
                },
                createdBy: adminId,
                creatorRole: 'ADMIN'
            }
        ];

        for (const vData of vehicles) {
            // Check if VIN already exists to avoid duplicates
            const exists = await Vehicle.findOne({ 'basicDetails.vin': vData.basicDetails.vin });
            if (!exists) {
                const vehicle = new Vehicle(vData);
                await vehicle.save();
                console.log(`Vehicle ${vData.basicDetails.fleetNumber} (${vData.basicDetails.make} ${vData.basicDetails.model}) created.`);
            } else {
                console.log(`Vehicle ${vData.basicDetails.fleetNumber} already exists.`);
            }
        }

        console.log('Seeding complete.');
    } catch (err) {
        console.error('Error seeding vehicles:', err);
    } finally {
        await mongoose.connection.close();
    }
}

seedVehicles();

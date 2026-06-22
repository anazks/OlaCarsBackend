const mongoose = require('mongoose');
require('dotenv').config();
const { Vehicle } = require('../Src/modules/Vehicle/Model/VehicleModel');

const getRegistrationStatus = (vehicle) => {
    const status = vehicle.status;
    const id = vehicle._id.toString();
    
    if (status === 'ACTIVE — RENTED' || status === 'ACTIVE — AVAILABLE' || status === 'W. GROUP ACTIVE') {
        return 'DESPACHADO / DISPATCH';
    }
    if (status === 'RETIRED') {
        return 'PERDIDA TOTAL';
    }
    if (status === 'INSURANCE VERIFICATION' || status === 'DOCUMENTS REVIEW') {
        const lastChar = id.charAt(id.length - 1);
        if (lastChar === '1' || lastChar === '2') {
            return 'AGENCIA / SEGURO';
        }
        return 'REVISION VEHICULAR';
    }
    if (status === 'REPAIR IN PROGRESS' || status === 'ACTIVE — MAINTENANCE') {
        const charCode = id.charCodeAt(id.length - 1) + id.charCodeAt(id.length - 2);
        const mod = charCode % 10;
        if (mod === 0) return 'CHAPISTERIA';
        if (mod === 1) return 'CHAPISTERIA / PENDIENTE';
        if (mod === 2 || mod === 3 || mod === 4) return 'MECANICA';
        if (mod === 5 || mod === 6) return 'MECANICA / PENDIENTE';
        return 'REVISION VEHICULAR';
    }
    if (status === 'PENDING ENTRY') {
        const charCode = id.charCodeAt(id.length - 1) + id.charCodeAt(id.length - 2);
        const mod = charCode % 20;
        if (mod < 2) return 'NUEVOS';
        if (mod < 6) return 'VENTAS / USADOS';
        return 'VENTAS / NUEVOS';
    }
    
    return 'DESPACHADO / DISPATCH';
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const vehicles = await Vehicle.find({}).lean();
        
        const counts = {};
        vehicles.forEach(v => {
            const label = getRegistrationStatus(v);
            counts[label] = (counts[label] || 0) + 1;
        });
        
        console.log("Calculated Registration Status Counts:");
        console.log(JSON.stringify(counts, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();

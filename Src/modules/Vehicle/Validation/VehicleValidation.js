const Joi = require("joi");

const VEHICLE_STATUSES = [
    "PENDING ENTRY",
    "DOCUMENTS REVIEW",
    "INSURANCE VERIFICATION",
    "INSPECTION REQUIRED",
    "INSPECTION FAILED",
    "REPAIR IN PROGRESS",
    "ACCOUNTING SETUP",
    "GPS ACTIVATION",
    "BRANCH MANAGER APPROVAL",
    "ACTIVE — AVAILABLE",
    "ACTIVE — RENTED",
    "ACTIVE — MAINTENANCE",
    "SUSPENDED",
    "TRANSFER PENDING",
    "TRANSFER COMPLETE",
    "RETIRED",
];

const addVehicleSchema = {
    body: Joi.object({
        purchaseDetails: Joi.object({
            purchaseOrder: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
            vendorName: Joi.string().trim(),
            purchaseDate: Joi.date(),
            purchasePrice: Joi.number().min(0),
            currency: Joi.string().trim(),
            paymentMethod: Joi.string().trim().valid("Cash", "Bank Transfer", "Finance"),
            financeDetails: Joi.object({
                lenderName: Joi.string().trim(),
                loanAmount: Joi.number().min(0),
                termMonths: Joi.number().min(0),
                monthlyInstalment: Joi.number().min(0),
            }),
            branch: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        }),
        basicDetails: Joi.object({
            make: Joi.string().trim().allow("", null),
            model: Joi.string().trim().allow("", null),
            year: Joi.number().min(1900).max(new Date().getFullYear() + 1),
            category: Joi.string().trim().valid("Sedan", "SUV", "Pickup", "Van", "Luxury", "Commercial"),
            fuelType: Joi.string().trim().valid("Petrol", "Diesel", "Hybrid", "Electric"),
            transmission: Joi.string().trim().valid("Automatic", "Manual"),
            engineCapacity: Joi.number().min(0),
            colour: Joi.string().trim(),
            seats: Joi.number().min(1),
            vin: Joi.string().trim().uppercase().allow("", null),
            engineNumber: Joi.string().trim(),
            bodyType: Joi.string().trim().valid("Hatchback", "Saloon", "Coupe", "Convertible", "Truck"),
            odometer: Joi.number().min(0),
            gpsSerialNumber: Joi.string().trim(),
            monthlyRent: Joi.number().min(0),
        }),
        insuranceId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
    }),
};

const progressVehicleSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        targetStatus: Joi.string().trim().valid(...VEHICLE_STATUSES).required(),
        updateData: Joi.object({
            insuranceDetails: Joi.object({
                plan: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
                insuranceNumber: Joi.string().trim(),
                fromDate: Joi.date(),
                toDate: Joi.date(),
                certificate: Joi.string().trim(),
                provider: Joi.string().trim(),
                policyType: Joi.string().trim(),
                coverageType: Joi.string().trim(),
                supplier: Joi.object({
                    _id: Joi.string().trim(),
                    name: Joi.string().trim(),
                    email: Joi.string().email().allow("", null),
                    phone: Joi.string().trim().allow("", null)
                }).unknown(true).allow(null)
            }),
            // ... other updateData fields can be added here if needed, 
            // but Joi.object().unknown() is often used for flexibility in progress updates
        }).unknown(true).default({}),
        notes: Joi.string().trim().allow("", null),
    }),
};

const assignCarToDriverSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
        driverId: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        durationWeeks: Joi.number().min(1).required(),
        weeklyRent: Joi.number().min(0).required(),
        notes: Joi.string().trim().allow("", null),
        agreementVersion: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/),
        generatedS3Key: Joi.string().trim(),
        signedS3Key: Joi.string().trim(),
    }),
};

const getVehicleByIdSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const uploadDocumentsSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
};

const updateLeaseSettingsSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        durationWeeks: Joi.number().min(1).required(),
        weeklyRent: Joi.number().min(0).required(),
    }),
};

const updateMaintenanceSettingsSchema = {
    params: Joi.object({
        id: Joi.string().trim().pattern(/^[0-9a-fA-F]{24}$/).required(),
    }),
    body: Joi.object({
        maintenanceThresholdKm: Joi.number().min(100).required(),
    }),
};

module.exports = {
    addVehicleSchema,
    progressVehicleSchema,
    assignCarToDriverSchema,
    getVehicleByIdSchema,
    uploadDocumentsSchema,
    updateLeaseSettingsSchema,
    updateMaintenanceSettingsSchema,
};

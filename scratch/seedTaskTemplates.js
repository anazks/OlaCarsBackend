require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const { TaskTemplate } = require("../Src/modules/TaskTemplate/Model/TaskTemplateModel");

// Mocking required schemas so mongoose doesn't throw lookup errors
mongoose.model("Branch", new mongoose.Schema({}));
const InventoryPart = mongoose.model("InventoryPart", new mongoose.Schema({
    partName: String,
    partNumber: String,
    category: String,
    unitCost: Number,
    quantityOnHand: Number,
    quantityReserved: Number,
    branchId: mongoose.Schema.Types.ObjectId,
    isActive: Boolean
}, { collection: "inventoryparts" }));

const SEED_TEMPLATES = [
    {
        name: "OIL FILTER CHANGE",
        category: "Mechanical",
        estimatedHours: 0.5,
        workOrderTypes: ["PREVENTIVE", "CORRECTIVE"],
        filterKeywords: ["oil filter"]
    },
    {
        name: "AIR FILTER CHANGE",
        category: "Mechanical",
        estimatedHours: 0.5,
        workOrderTypes: ["PREVENTIVE", "CORRECTIVE"],
        filterKeywords: ["air filter"]
    },
    {
        name: "AC FILTER CHANGE",
        category: "Electrical",
        estimatedHours: 0.5,
        workOrderTypes: ["PREVENTIVE", "CORRECTIVE"],
        filterKeywords: ["ac filter", "a/c filter", "cabin filter"]
    },
    {
        name: "ENGINE OIL CHANGE",
        category: "Fluids",
        estimatedHours: 0.5,
        workOrderTypes: ["PREVENTIVE", "CORRECTIVE"],
        filterKeywords: ["engine oil", "cvt transmission oil", "10w30", "5w30"]
    },
    {
        name: "COOLANT TOP-UP",
        category: "Fluids",
        estimatedHours: 0.3,
        workOrderTypes: ["PREVENTIVE", "CORRECTIVE"],
        filterKeywords: ["coolant"]
    }
];

const seed = async () => {
    try {
        const uri = process.env.MONGO_URI || "mongodb+srv://integracionolacars_db_user:Olacars2026%40@cluster0.6bdmvf.mongodb.net/olaCarsFresh?appName=Cluster0";
        console.log("Connecting to Database:", uri);
        await mongoose.connect(uri);
        console.log("Connected successfully!");

        // Find all active parts
        const parts = await InventoryPart.find({ isActive: { $ne: false } });
        console.log(`Found ${parts.length} active inventory parts.`);

        if (parts.length === 0) {
            console.log("No inventory parts found. Please add inventory parts first.");
            process.exit(0);
        }

        // Get unique branches from the inventory parts
        const branchIds = [...new Set(parts.map(p => p.branchId ? p.branchId.toString() : null))].filter(Boolean);
        console.log(`Identified branches from inventory:`, branchIds);

        // Delete existing templates first to start clean
        await TaskTemplate.deleteMany({});
        console.log("Deleted existing task templates.");

        let totalSeeded = 0;

        for (const branchId of branchIds) {
            const branchParts = parts.filter(p => p.branchId && p.branchId.toString() === branchId);
            
            for (const t of SEED_TEMPLATES) {
                // Find parts that match the keywords for this branch
                const linkedParts = [];
                for (const bp of branchParts) {
                    const nameLower = (bp.partName || "").toLowerCase();
                    const numLower = (bp.partNumber || "").toLowerCase();
                    const matchesKeyword = t.filterKeywords.some(kw => nameLower.includes(kw) || numLower.includes(kw));
                    
                    if (matchesKeyword) {
                        linkedParts.push({
                            inventoryPartId: bp._id,
                            partName: bp.partName,
                            partNumber: bp.partNumber,
                            defaultQuantity: 1
                        });
                    }
                }

                console.log(`Branch ${branchId} - Task ${t.name}: linked ${linkedParts.length} parts.`);

                await TaskTemplate.create({
                    name: t.name,
                    category: t.category,
                    estimatedHours: t.estimatedHours,
                    workOrderTypes: t.workOrderTypes,
                    linkedParts: linkedParts,
                    branchId: new mongoose.Types.ObjectId(branchId),
                    isActive: true,
                    createdBy: new mongoose.Types.ObjectId("60c72b2f9b1d8b2bad000001"), // Admin placeholder
                    creatorRole: "admin"
                });
                totalSeeded++;
            }
        }

        console.log(`Successfully seeded ${totalSeeded} task templates!`);
        process.exit(0);
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    }
};

seed();

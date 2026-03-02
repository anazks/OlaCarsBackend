const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.set('strictQuery', false);

// 1. Simulate the exact schemas
const adminSchema = new Schema({ fullName: String }, { timestamps: true });
const Admin = mongoose.model("Admin", adminSchema);

const branchSchema = new Schema(
    {
        name: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "creatorModelName",
            required: true,
        },
        creatorRole: {
            type: String,
            required: true,
            enum: ["ADMIN", "OPERATIONADMIN", "FINANCEADMIN", "COUNTRYMANAGER"],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

branchSchema.virtual('creatorModelName').get(function () {
    const roleMapping = {
        'ADMIN': 'Admin',
        'OPERATIONADMIN': 'OperationalAdmin',
        'FINANCEADMIN': 'FinanceAdmin',
        'COUNTRYMANAGER': 'CountryManager'
    };
    return roleMapping[this.creatorRole] || this.creatorRole;
});

const Branch = mongoose.model("Branch", branchSchema);

async function run() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.h9lmv8j.mongodb.net/olaCars?appName=Cluster0');
        console.log("Connected to DB");

        // Fetch the specific branch the user mentioned
        const branch = await Branch.findOne({ code: "KOC01" }).populate('createdBy');
        console.log("Loaded Branch:");
        console.log(JSON.stringify(branch, null, 2));

    } catch (err) {
        console.error("Error during populate:", err.message);
    } finally {
        mongoose.disconnect();
    }
}

run();

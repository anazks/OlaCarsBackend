const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.set('strictQuery', false);

// 1. Simulate the exact schemas exactly as they are in the project
const adminSchema = new Schema({ fullName: String }, { timestamps: true });
const Admin = mongoose.model("Admin", adminSchema);

const branchSchema = new Schema(
    {
        name: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "creatorRole",
            required: true,
        },
        creatorRole: {
            type: String,
            required: true,
            enum: ["ADMIN", "OPERATIONADMIN", "FINANCEADMIN", "COUNTRYMANAGER"],
        },
    },
    { timestamps: true }
);

branchSchema.post(['find', 'findOne'], async function (docs) {
    if (!docs) return;

    // Map of role enum to actual mongoose model names
    const roleToModelMapping = {
        'ADMIN': 'Admin',
        'OPERATIONADMIN': 'OperationalAdmin',
        'FINANCEADMIN': 'FinanceAdmin',
        'COUNTRYMANAGER': 'CountryManager'
    };

    const processDoc = (doc) => {
        if (doc && doc.creatorRole && roleToModelMapping[doc.creatorRole]) {
            doc.creatorRole = roleToModelMapping[doc.creatorRole];
        }
    };

    if (Array.isArray(docs)) {
        docs.forEach(processDoc);
    } else {
        processDoc(docs);
    }
});
const Branch = mongoose.model("Branch", branchSchema);

async function run() {
    try {
        const admin = new Admin({ fullName: "Test Admin" });
        const b = new Branch({
            name: "Test Branch",
            createdBy: admin._id,
            creatorRole: "ADMIN"
        });

        console.log("Registered models:");
        console.log(Object.keys(mongoose.models));

        // To test find().populate() offline, we need a DB connection since post query hooks trigger on real queries
        await mongoose.connect('mongodb://127.0.0.1:27017/ola_cars_test');
        await Admin.deleteMany({});
        await Branch.deleteMany({});

        await admin.save();
        await b.save();

        console.log("Saved. Now querying:");
        const branches = await Branch.find({}).populate('createdBy', 'fullName role email');

        console.log("Populated Successfully:", branches[0].createdBy.fullName);
    } catch (err) {
        console.error("Error during populate:", err.message);
    } finally {
        process.exit(0);
    }
}

run();

const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.h9lmv8j.mongodb.net/olaCars?appName=Cluster0');

        const adminSchema = new mongoose.Schema({ fullName: String }, { timestamps: true });
        mongoose.model("Admin", adminSchema);
        mongoose.model("ADMIN", adminSchema, "admins");

        const branchSchema = new mongoose.Schema({
            name: String,
            createdBy: { type: mongoose.Schema.Types.ObjectId, refPath: "creatorRole" },
            creatorRole: String
        });
        const Branch = mongoose.model("Branch", branchSchema);

        console.log("Models:", Object.keys(mongoose.models));
        const branch = await Branch.findOne({ code: "KOC01" }).populate('createdBy');
        require('fs').writeFileSync('out.json', JSON.stringify(branch || { error: "Not found" }, null, 2));
        console.log("Done");
    } catch (e) {
        require('fs').writeFileSync('out.json', JSON.stringify({ error: e.message }));
    } finally {
        process.exit(0);
    }
}
test();

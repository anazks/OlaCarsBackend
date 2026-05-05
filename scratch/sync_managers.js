const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/anton/OneDrive/Documents/vs coding/OlaCarsBackend/.env' });

async function sync() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const managers = await mongoose.connection.collection('branchmanagers').find({ 
            branchId: { $exists: true, $ne: null } 
        }).toArray();
        
        console.log(`Found ${managers.length} managers to sync`);
        
        for (const manager of managers) {
            await mongoose.connection.collection('branches').updateOne(
                { _id: manager.branchId },
                { $set: { branchManager: manager._id } }
            );
            console.log(`Linked manager ${manager.fullName} to branch ${manager.branchId}`);
        }
        
        console.log('Sync complete');
        process.exit(0);
    } catch (e) {
        console.error('Sync failed:', e);
        process.exit(1);
    }
}

sync();

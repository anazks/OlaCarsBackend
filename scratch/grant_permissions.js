const mongoose = require('mongoose');
require('dotenv').config();
const RoleTemplate = require('../Src/modules/AccessControl/Model/RoleTemplate');

async function grantPermissions() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const roles = ['WORKSHOPSTAFF', 'WORKSHOPMANAGER', 'FINANCESTAFF'];
    const newPerms = ['ACCOUNTING_CODE_VIEW', 'SERVICE_BILL_VIEW', 'SERVICE_BILL_EDIT', 'PAYMENT_CREATE'];

    for (const role of roles) {
        const template = await RoleTemplate.findOne({ roleName: role });
        if (template) {
            const updatedPerms = [...new Set([...template.permissions, ...newPerms])];
            await RoleTemplate.updateOne({ roleName: role }, { $set: { permissions: updatedPerms } });
            console.log(`Updated permissions for ${role}`);
        } else {
            console.log(`Creating template for ${role}`);
            await RoleTemplate.create({ roleName: role, permissions: newPerms });
        }
    }
    
    process.exit(0);
}

grantPermissions();

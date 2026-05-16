const mongoose = require('mongoose');
require('dotenv').config();
const RoleTemplate = require('../Src/modules/AccessControl/Model/RoleTemplate');

async function checkWorkshopStaffPermissions() {
    await mongoose.connect(process.env.MONGO_URI);
    const template = await RoleTemplate.findOne({ roleName: 'WORKSHOPSTAFF' });
    if (template) {
        console.log('WORKSHOPSTAFF Permissions:', template.permissions);
    } else {
        console.log('No RoleTemplate found for WORKSHOPSTAFF');
    }
    process.exit(0);
}

checkWorkshopStaffPermissions();

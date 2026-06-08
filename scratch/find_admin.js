const mongoose = require('mongoose');
require('dotenv').config();
const Admin = require('../Src/modules/Admin/model/adminModel');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await Admin.findOne();
    if (user) {
        console.log(JSON.stringify({
            id: user._id,
            email: user.email,
            role: user.role
        }, null, 2));
    } else {
        console.log("No ADMIN user found");
    }
    process.exit(0);
}
run();

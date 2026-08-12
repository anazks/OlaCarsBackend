const mongoose = require('mongoose');
const path = require('path');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const filePath = path.join(__dirname, '../depositdebitnotes - Copy.xlsx');
const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(worksheet);

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Admin = require('../Src/modules/Admin/Model/AdminModel');
    const Customer = require('../Src/modules/Customer/Model/CustomerModel');
    const { Driver } = require('../Src/modules/Driver/Model/DriverModel');

    const admin = await Admin.findOne();
    console.log('ADMIN RECORD:', admin ? { _id: admin._id, email: admin.email, role: admin.role || 'ADMIN' } : 'NONE');

    process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });

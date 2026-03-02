const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({});
const Admin = mongoose.model("Admin", adminSchema);

// Mongoose does not connect here, but it generates collection name
require('fs').writeFileSync('out.txt', Admin.collection.name + '\n');

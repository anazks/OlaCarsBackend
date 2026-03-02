const mongoose = require('mongoose');

const s = new mongoose.Schema({ name: String });

const Admin = mongoose.model('Admin', s);
mongoose.model('ADMIN', s);

console.log(mongoose.model('Admin').collection.name);
console.log(mongoose.model('ADMIN').collection.name);

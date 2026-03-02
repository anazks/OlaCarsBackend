const mongoose = require('mongoose');

const s = new mongoose.Schema({ name: String });
const s2 = new mongoose.Schema({
    ref: { type: mongoose.Schema.Types.ObjectId, refPath: 'role' },
    role: String
});

mongoose.model('Admin', s);
const T = mongoose.model('Test', s2);

async function run() {
    const t = new T({ role: 'ADMIN' });
    try {
        await t.populate('ref');
        console.log("Populate success!");
    } catch (err) {
        console.error(err.message);
    }
}
run();

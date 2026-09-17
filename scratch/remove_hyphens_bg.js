const mongoose = require('mongoose');
require('dotenv').config();
const BankAccount = require('../Src/modules/BankAccount/Model/BankAccountModel');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const accounts = await BankAccount.find({
      bankName: /banco general/i,
      isDeleted: { $ne: true }
    });

    for (const acc of accounts) {
      const old = acc.accountNumber;
      const updated = old.replace(/-/g, '');
      acc.accountNumber = updated;
      await acc.save();
      console.log(`"${acc.accountName}": ${old} => ${updated}`);
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();

require("dotenv").config({ path: "C:/Users/leno2/Desktop/OlaCarsBackend/.env" });
const mongoose = require("mongoose");
const { hasPermission } = require("./Src/shared/middlewares/permissionMiddleware.js");

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // Create a mock req/res/next
  const req = {
    user: {
      id: "69ddc0a158a5880a6be10c7a", // Shubham's ID
      role: "COUNTRYMANAGER"
    }
  };
  const res = {};
  let errorReturned = null;
  const next = (err) => {
    errorReturned = err;
  };

  const middleware = hasPermission("BRANCH_CREATE");
  console.log("Testing hasPermission('BRANCH_CREATE') for Shubham...");
  await middleware(req, res, next);
  
  if (errorReturned) {
    console.log("Middleware successfully blocked access:", errorReturned.message, errorReturned.statusCode);
  } else {
    console.log("Middleware allowed access!");
    console.log("Req permissions:", req.user.permissions);
  }
  
  process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});

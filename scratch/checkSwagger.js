const swaggerSpec = require("../Src/config/swagger.config");
console.log("PATHS:", Object.keys(swaggerSpec.paths || {}));
if (swaggerSpec.paths && swaggerSpec.paths["/api/dashboard/financial-summary"]) {
    console.log("FOUND DASHBOARD IN SPEC");
} else {
    console.log("NOT FOUND IN SPEC");
}

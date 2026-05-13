const http = require("http");

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/dashboard/financial-summary",
  method: "GET"
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  process.exit(0);
});

req.on("error", (e) => {
  console.error(`problem with request: ${e.message}`);
  process.exit(1);
});

req.end();

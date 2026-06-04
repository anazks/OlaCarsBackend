const jwt = require("jsonwebtoken");
const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

function run() {
    try {
        const payload = {
            id: "69f5d6a29807cf101fda4498",
            role: "ADMIN",
            fullName: "Administrator"
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
        console.log("Generated JWT Token:", token);

        console.log("Sending GET request to credit note PDF endpoint...");
        const req = http.request({
            host: "localhost",
            port: 3000,
            path: "/api/credit-notes/6a1e6f9d3eed30b6ef6b8a44/pdf",
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, (res) => {
            console.log("Response Status:", res.statusCode);
            console.log("Response Headers:", res.headers);
            
            let body = "";
            res.on("data", (chunk) => {
                body += chunk.toString("utf8");
            });
            
            res.on("end", () => {
                console.log("Response Body Length:", body.length);
                console.log("Response Body:", body);
                process.exit(res.statusCode === 200 ? 0 : 1);
            });
        });

        req.on("error", (err) => {
            console.error("HTTP Request Error:", err);
            process.exit(1);
        });

        req.end();
    } catch (err) {
        console.error("Caught error:", err);
        process.exit(1);
    }
}

run();

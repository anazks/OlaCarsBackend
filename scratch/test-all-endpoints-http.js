const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Models
const CreditNote = require("../Src/modules/CreditNote/Model/CreditNoteModel");
const Expense = require("../Src/modules/Expense/Model/ExpenseModel");
const Voucher = require("../Src/modules/Ledger/Model/VoucherModel");
const { Driver } = require("../Src/modules/Driver/Model/DriverModel");
const Supplier = require("../Src/modules/Supplier/Model/SupplierModel");

function makeRequest(path, token) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "localhost",
            port: 3000,
            path,
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => {
                body += chunk.toString("binary");
            });
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    bodyLength: body.length,
                    body: body
                });
            });
        });

        req.on("error", (err) => {
            reject(err);
        });

        req.end();
    });
}

async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        // Fetch one of each
        const creditNote = await CreditNote.findOne({ isDeleted: { $ne: true } });
        const expense = await Expense.findOne({ isDeleted: { $ne: true } });
        const voucher = await Voucher.findOne({ isDeleted: { $ne: true } });
        const driver = await Driver.findOne({ isDeleted: { $ne: true } });
        const supplier = await Supplier.findOne({ isDeleted: { $ne: true } });

        console.log("Found sample documents:");
        console.log(`- Credit Note: ${creditNote ? creditNote._id : "None"}`);
        console.log(`- Expense: ${expense ? expense._id : "None"}`);
        console.log(`- Voucher: ${voucher ? voucher._id : "None"}`);
        console.log(`- Driver: ${driver ? driver._id : "None"}`);
        console.log(`- Supplier: ${supplier ? supplier._id : "None"}`);

        // Sign token
        const payload = {
            id: "69f5d6a29807cf101fda4498",
            _id: "69f5d6a29807cf101fda4498",
            role: "ADMIN",
            fullName: "Administrator"
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });

        const tests = [];
        if (creditNote) {
            tests.push({
                name: "Credit Note PDF",
                path: `/api/credit-notes/${creditNote._id}/pdf`
            });
        }
        if (expense) {
            tests.push({
                name: "Expense PDF",
                path: `/api/expenses/${expense._id}/pdf`
            });
        }
        if (voucher) {
            tests.push({
                name: "Voucher PDF",
                path: `/api/vouchers/${voucher._id}/pdf`
            });
        }
        if (driver) {
            tests.push({
                name: "Driver Contract PDF",
                path: `/api/driver/${driver._id}/contract/pdf`
            });
        }
        if (supplier) {
            tests.push({
                name: "Supplier PDF",
                path: `/api/supplier/${supplier._id}/pdf`
            });
        }

        let failed = 0;
        for (const test of tests) {
            console.log(`\nTesting: ${test.name} at ${test.path}...`);
            try {
                const res = await makeRequest(test.path, token);
                console.log(`Response Status: ${res.statusCode}`);
                console.log(`Content-Type: ${res.headers["content-type"]}`);
                console.log(`Content-Disposition: ${res.headers["content-disposition"]}`);
                console.log(`Length: ${res.bodyLength} bytes`);

                if (res.statusCode !== 200 || !res.headers["content-type"].includes("application/pdf")) {
                    console.error(`[FAIL] ${test.name} endpoint failed!`);
                    console.error(`Response Body: ${res.body}`);
                    failed++;
                } else {
                    console.log(`[PASS] ${test.name} generated successfully.`);
                }
            } catch (err) {
                console.error(`[ERROR] Test threw exception:`, err);
                failed++;
            }
        }

        console.log(`\nAll tests completed. Failed: ${failed}`);
        await mongoose.disconnect();
        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error("Fatal test error:", err);
        process.exit(1);
    }
}

run();

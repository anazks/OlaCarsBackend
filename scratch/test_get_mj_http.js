const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
    console.log("Logging in...");
    const loginRes = await fetch("http://localhost:3000/api/finance-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: "financialadmin@olacars.com",
            password: "Test@1234"
        })
    });
    
    if (!loginRes.ok) {
        throw new Error(`Login failed with status: ${loginRes.status} ${await loginRes.text()}`);
    }
    
    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    console.log("Logged in successfully!");
    
    console.log("\n1. Fetching with query params (May 2026 range)...");
    const getRes = await fetch("http://localhost:3000/api/ledger/journals?startDate=2026-05-01&endDate=2026-05-31", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    
    if (!getRes.ok) {
        throw new Error(`Fetch failed with status: ${getRes.status} ${await getRes.text()}`);
    }
    
    const getData = await getRes.json();
    console.log("Response results count:", getData.results);
    console.log("Data length:", getData.data.length);
    console.log("Pagination:", JSON.stringify(getData.pagination, null, 2));
    
    if (getData.data.length > 0) {
        console.log("First journal number:", getData.data[0].journalNumber);
        console.log("First journal date:", getData.data[0].date);
        console.log("First journal totalAmount:", getData.data[0].totalAmount);
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error("ERROR:", err.message);
    process.exit(1);
});

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const CreditNoteController = require("../Src/modules/CreditNote/Controller/CreditNoteController");

// Mock response object
class MockResponse {
    constructor() {
        this.headers = {};
        this.statusCode = 200;
        this.data = null;
    }

    setHeader(name, value) {
        this.headers[name] = value;
        return this;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    json(obj) {
        this.data = obj;
        console.log(`[MockResponse] json() called with status ${this.statusCode}:`, obj);
        return this;
    }

    // Mock stream methods since pdfkit pipes to res
    write(chunk) {
        // console.log(`[MockResponse] write() chunk of length ${chunk.length}`);
        return true;
    }

    end(chunk) {
        // console.log("[MockResponse] end() called");
        console.log(`[MockResponse] PDF Generation complete. Status: ${this.statusCode}. Headers:`, this.headers);
        mongoose.connection.close();
        process.exit(0);
    }

    emit(event, ...args) {
        // No-op
    }

    on(event, handler) {
        // No-op
    }

    once(event, handler) {
        // No-op
    }
}

async function run() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database.");

        const req = {
            params: {
                id: "6a1e6f9d3eed30b6ef6b8a44"
            }
        };

        const res = new MockResponse();

        console.log("Running downloadCreditNotePdf controller...");
        await CreditNoteController.downloadCreditNotePdf(req, res);
    } catch (err) {
        console.error("Outer error caught:", err);
        mongoose.connection.close();
        process.exit(1);
    }
}

run();

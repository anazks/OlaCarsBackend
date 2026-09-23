/**
 * Verification test for Bill Item Duplicate-Skipping logic in bulk upload.
 */

const originalRequire = module.constructor.prototype.require;

const mockBranchData = [
    { _id: "branch-001", name: "Downtown Branch", code: "BR01", country: "Panama", isDeleted: false, status: "ACTIVE" }
];

const mockSupplierData = [
    { _id: "supplier-001", name: "Acme Car Parts", vendorNumber: "VEND-001", isDeleted: false }
];

const mockAccountData = [
    { _id: "acc-001", name: "Cost of Goods Sold", code: "5000", isDeleted: false, isActive: true },
    { _id: "acc-002", name: "Accounts Payable", code: "2.1.01", isDeleted: false, isActive: true }
];

const createdBills = [];
let existingBillMock = null;

module.constructor.prototype.require = function (id) {
    if (id === "mongoose" || id.endsWith("mongoose")) {
        const Schema = function (def, opts) { this.paths = {}; };
        Schema.Types = { ObjectId: "ObjectId" };
        Schema.prototype.index = function () { };
        Schema.prototype.virtual = function () { return { get: function() { return this; } }; };
        Schema.prototype.pre = function () { return this; };
        Schema.prototype.post = function () { return this; };

        const mockModel = (n, s) => {
            return {
                modelName: n,
                schema: s,
                find: async (query) => {
                    if (n === "Branch") return mockBranchData;
                    if (n === "Supplier") return mockSupplierData;
                    if (n === "AccountingCode") return mockAccountData;
                    return [];
                },
                findOne: async (query) => {
                    if (n === "Bill") return existingBillMock;
                    return null;
                },
                findById: async (id) => null,
                create: async (data) => {
                    if (n === "Bill") createdBills.push(data);
                    return { ...data, _id: "bill-id-123", toObject: function() { return this; } };
                }
            };
        };

        return {
            Schema,
            model: mockModel,
            Types: { ObjectId: { isValid: () => false } }
        };
    }
    return originalRequire.apply(this, arguments);
};

async function runTests() {
    console.log("=== Running Bill Item Duplicate Skipping Tests ===");
    const BillService = require("../Src/modules/Bill/Service/BillService");

    const actor = { id: "user-1", role: "ADMIN" };

    // TEST 1: Intra-file duplicate items for a new bill
    console.log("\n[Test 1] Uploading new bill with duplicate line items in the file...");
    const rowsWithDuplicates = [
        {
            "Bill Number": "BILL-TEST-001",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Oil Filter",
            "Quantity": "2",
            "Rate": "15.00"
        },
        {
            "Bill Number": "BILL-TEST-001",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Oil Filter", // Exact duplicate
            "Quantity": "2",
            "Rate": "15.00"
        },
        {
            "Bill Number": "BILL-TEST-001",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Air Filter", // Different item
            "Quantity": "1",
            "Rate": "25.00"
        }
    ];

    const res1 = await BillService.bulkUploadBills(rowsWithDuplicates, actor, "branch-001", null, { skipDuplicates: true });
    
    if (createdBills.length === 1 && createdBills[0].items.length === 2) {
        console.log("✓ PASS: New bill created with only 2 items (duplicate Oil Filter skipped).");
    } else {
        console.error("✗ FAIL: Expected 2 items on created bill, got:", createdBills[0]?.items?.length);
        process.exit(1);
    }

    if (res1.skipped.length > 0 && res1.skipped.some(s => s.includes("duplicate item(s) within upload file"))) {
        console.log("✓ PASS: Skipped duplicate reported in skipped messages:", res1.skipped);
    } else {
        console.error("✗ FAIL: Skipped duplicate not reported:", res1.skipped);
        process.exit(1);
    }

    // TEST 2: Existing bill in DB - all items in upload are duplicates
    console.log("\n[Test 2] Re-uploading items for an existing bill where all items already exist...");
    let savedBill = null;
    existingBillMock = {
        _id: "existing-bill-001",
        billNumber: "BILL-TEST-002",
        branch: "branch-001",
        totalAmount: 100,
        amountPaid: 0,
        balanceDue: 100,
        status: "OPEN",
        items: [
            {
                itemName: "Brake Pads",
                quantity: 4,
                unitPrice: 25.00,
                accountId: "acc-001"
            }
        ],
        save: async function () {
            savedBill = this;
        }
    };

    const duplicateRowsForExistingBill = [
        {
            "Bill Number": "BILL-TEST-002",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Brake Pads",
            "Quantity": "4",
            "Rate": "25.00"
        }
    ];

    const res2 = await BillService.bulkUploadBills(duplicateRowsForExistingBill, actor, "branch-001", null, { skipDuplicates: true });

    if (res2.skippedCount === 1 && savedBill === null) {
        console.log("✓ PASS: Existing bill untouched, skippedCount incremented, message reported:", res2.skipped);
    } else {
        console.error("✗ FAIL: Expected existing bill to be untouched, but savedBill was updated or skippedCount mismatch.");
        process.exit(1);
    }

    // TEST 3: Existing bill in DB - 1 duplicate item and 1 new item
    console.log("\n[Test 3] Uploading 1 duplicate item and 1 new item for an existing bill...");
    savedBill = null;
    const mixedRows = [
        {
            "Bill Number": "BILL-TEST-002",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Brake Pads", // Duplicate
            "Quantity": "4",
            "Rate": "25.00"
        },
        {
            "Bill Number": "BILL-TEST-002",
            "Bill Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Branch Name": "Downtown Branch",
            "Debit Account": "5000",
            "Item Name": "Spark Plug", // New item: qty 2 @ $10 = $20
            "Quantity": "2",
            "Rate": "10.00"
        }
    ];

    const res3 = await BillService.bulkUploadBills(mixedRows, actor, "branch-001", null, { skipDuplicates: true });

    if (savedBill && savedBill.items.length === 2 && savedBill.totalAmount === 120) {
        console.log("✓ PASS: Only new item (Spark Plug) added. Total updated from 100 to 120.");
    } else {
        console.error("✗ FAIL: Expected 2 items and total 120, got:", savedBill?.items?.length, savedBill?.totalAmount);
        process.exit(1);
    }

    if (res3.skipped.some(s => s.includes("duplicate item(s) already on bill; added 1 new item(s)"))) {
        console.log("✓ PASS: Duplicate item skipping note present in response:", res3.skipped);
    } else {
        console.error("✗ FAIL: Did not find duplicate skip note in response:", res3.skipped);
        process.exit(1);
    }

    console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});

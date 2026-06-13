/**
 * Verification for Purchase Order Bulk Upload service logic.
 * Self-contained unit test mocking mongoose before requiring modules.
 */

// Step 1: Install mocks for mongoose models
const originalRequire = module.constructor.prototype.require;

const mockBranchData = [
    { _id: "branch-001", name: "Downtown Branch", code: "BR01", country: "Panama", isDeleted: false },
    { _id: "branch-002", name: "West Depot", code: "BR02", country: "Costa Rica", isDeleted: false, status: "ACTIVE" }
];

const mockSupplierData = [
    { _id: "supplier-001", name: "Acme Car Parts", vendorNumber: "VEND-001", isDeleted: false },
    { _id: "supplier-002", name: "Panama Fleet Supplies S.A.", vendorNumber: "VEND-002", isDeleted: false }
];

const mockAccountData = [
    { _id: "acc-001", name: "Cost of Goods Sold", code: "5000", isDeleted: false, isActive: true },
    { _id: "acc-002", name: "Office Equipment", code: "1200", isDeleted: false, isActive: true }
];

// In-memory array of created documents for validation
const createdDocs = [];
let queryOneMock = null;

module.constructor.prototype.require = function (id) {
    if (id === "mongoose" || id.endsWith("mongoose")) {
        const Schema = function (def, opts) { this.paths = {}; };
        Schema.Types = { ObjectId: "ObjectId" };
        Schema.prototype.index = function () { };
        
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
                    if (queryOneMock) return queryOneMock(query);
                    return null;
                },
                create: async (data) => {
                    createdDocs.push(data);
                    return data;
                }
            };
        };

        return { 
            Schema, 
            model: mockModel 
        };
    }
    return originalRequire.apply(this, arguments);
};

// Step 2: Require service
const PurchaseOrderService = require("../Src/modules/PurchaseOrder/Service/PurchaseOrderService");

// Restore require hook
module.constructor.prototype.require = originalRequire;

// Test harness helper
let P = 0, F = 0;
const ok = (cond, name) => {
    if (cond) {
        P++;
        console.log(`  + [PASS] ${name}`);
    } else {
        F++;
        console.error(`  X [FAIL] ${name}`);
    }
};

const runTests = async () => {
    console.log("Starting Purchase Order Bulk Import Unit Tests...\n");

    // Test Case 1: Import valid PO with two lines (grouping)
    console.log("--- Test Case 1: Valid Import & Multi-row Grouping ---");
    createdDocs.length = 0;
    queryOneMock = () => null; // No duplicate exists

    const testRows1 = [
        {
            "Purchase Order Number": "PO-001",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Location Name": "Downtown Branch",
            "Item Name": "Engine Oil 5W30",
            "Item Price": "45.00",
            "QuantityOrdered": "10",
            "Item Desc": "Synthetic oil",
            "Account Code": "5000",
            "Template Name": "Standard Template",
            "Reference#": "REF-123",
            "Product ID": "PROD-A"
        },
        {
            "Purchase Order Number": "PO-001",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Location Name": "Downtown Branch",
            "Item Name": "Oil Filter",
            "Item Price": "12.50",
            "QuantityOrdered": "5",
            "Account": "Cost of Goods Sold",
            "Product ID": "PROD-B"
        }
    ];

    const actor = { id: "user-admin", role: "ADMIN" };
    const result1 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows1, actor, null);

    ok(result1.successCount === 1, "Should successfully group and create 1 Purchase Order");
    ok(result1.errorCount === 0, "Should have 0 errors");
    ok(result1.skippedCount === 0, "Should have 0 skipped POs");
    ok(createdDocs.length === 1, "One PO document saved to database");

    const createdPO = createdDocs[0];
    ok(createdPO.purchaseOrderNumber === "PO-001", "PO number matches");
    ok(createdPO.items.length === 2, "PO has exactly 2 items");
    ok(createdPO.totalAmount === (10 * 45.00) + (5 * 12.50), "Total amount is correctly aggregated");
    ok(createdPO.branch === "branch-001", "Branch correctly resolved by Location Name");
    ok(createdPO.supplier === "supplier-001", "Supplier correctly resolved by Vendor Name");
    ok(createdPO.items[0].accountId === "acc-001", "First item account resolved by Account Code");
    ok(createdPO.items[1].accountId === "acc-001", "Second item account resolved by Account Name");

    // Check unmapped field wrapping in descriptions
    ok(createdPO.description.includes("Template Name: Standard Template"), "Top-level description has unmapped field");
    ok(createdPO.description.includes("Reference#: REF-123"), "Top-level description has reference");
    ok(createdPO.items[0].description.includes("Product ID: PROD-A"), "Item-level description has product ID");
    ok(createdPO.items[1].description.includes("Product ID: PROD-B"), "Item-level description has product ID");

    // Test Case 2: Status Normalization (e.g. Billed status)
    console.log("\n--- Test Case 2: Status Normalization ---");
    createdDocs.length = 0;
    const testRows2 = [
        {
            "Purchase Order Number": "PO-002",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Panama Fleet Supplies S.A.",
            "Location ID": "branch-002",
            "Item Name": "Brake Pads",
            "Item Price": "30.00",
            "QuantityOrdered": "2",
            "Purchase Order Status": "Billed"
        }
    ];

    const result2 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows2, actor, null);
    ok(result2.successCount === 1, "Status normalization PO created");
    const billedPO = createdDocs[0];
    ok(billedPO.status === "APPROVED", "Status normalized to APPROVED");
    ok(billedPO.isBilled === true, "isBilled flag set to true");

    // Test Case 3: Merge items into existing PO
    console.log("\n--- Test Case 3: Merge Items Into Existing PO ---");
    createdDocs.length = 0;

    // Simulate an existing PO document with a save method
    const existingItems = [{ itemName: "Existing Item", quantity: 1, unitPrice: 10 }];
    let savedExistingPO = false;
    const mockExistingPO = {
        _id: "po-exist-1",
        purchaseOrderNumber: "PO-EXISTS",
        items: [...existingItems],
        totalAmount: 10,
        save: async function() { savedExistingPO = true; }
    };

    queryOneMock = (query) => {
        if (query.purchaseOrderNumber === "PO-EXISTS") {
            return mockExistingPO;
        }
        return null;
    };

    const testRows3 = [
        {
            "Purchase Order Number": "PO-EXISTS",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Item Name": "Brake Pads",
            "Item Price": "30.00",
            "QuantityOrdered": "2"
        }
    ];

    const result3 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows3, actor, null);
    ok(result3.successCount === 0, "Should not create a new PO");
    ok(result3.updatedCount === 1, "Should count 1 updated PO");
    ok(savedExistingPO === true, "Existing PO was saved");
    ok(mockExistingPO.items.length === 2, "Existing PO now has 2 items (1 old + 1 new)");
    ok(mockExistingPO.items[1].itemName === "Brake Pads", "New item appended correctly");
    ok(mockExistingPO.totalAmount === 70, "Total updated (10 + 2*30 = 70)");

    // Test Case 4: Supplier Fuzzy Match
    console.log("\n--- Test Case 4: Fuzzy Supplier Matching ---");
    createdDocs.length = 0;
    queryOneMock = () => null;

    const testRows4 = [
        {
            "Purchase Order Number": "PO-003",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Panama Fleet Supplies", // Fuzzy match (missing "S.A.")
            "Item Name": "Headlight Bulb",
            "Item Price": "15.00",
            "QuantityOrdered": "4"
        }
    ];

    const result4 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows4, actor, null);
    ok(result4.successCount === 1, "Fuzzy supplier matched successfully");
    ok(createdDocs[0].supplier === "supplier-002", "Supplier ID resolved to supplier-002");

    // Test Case 5: Missing Item Name Fallback
    console.log("\n--- Test Case 5: Missing Item Name Fallback ---");
    createdDocs.length = 0;
    queryOneMock = () => null;

    const testRows5 = [
        {
            "Purchase Order Number": "PO-004",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Acme Car Parts",
            "Item Price": "50.00",
            "QuantityOrdered": "3"
            // No Item Name
        }
    ];

    const result5 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows5, actor, null);
    ok(result5.successCount === 1, "PO with missing item name created successfully");
    ok(createdDocs[0].items[0].itemName === "No Item Details", "Item name defaulted to 'No Item Details'");

    // Test Case 6: Unresolved Supplier Fallback
    console.log("\n--- Test Case 6: Unresolved Supplier Fallback ---");
    createdDocs.length = 0;
    queryOneMock = () => null;

    const testRows6 = [
        {
            "Purchase Order Number": "PO-005",
            "Purchase Order Date": "2026-06-12",
            "Vendor Name": "Non-existent Supplier Inc",
            "Vendor Number": "VEND-999",
            "Item Name": "Air Filter",
            "Item Price": "25.00",
            "QuantityOrdered": "5"
        }
    ];

    const result6 = await PurchaseOrderService.bulkUploadPurchaseOrders(testRows6, actor, null);
    ok(result6.successCount === 1, "PO with non-existent supplier created successfully");
    ok(createdDocs[0].supplier === undefined, "Supplier field is undefined");
    ok(createdDocs[0].description.includes("Vendor Name: Non-existent Supplier Inc"), "Vendor name preserved in description");
    ok(createdDocs[0].description.includes("Vendor Number: VEND-999"), "Vendor number preserved in description");

    console.log(`\n===========================================`);
    console.log(`Unit Tests Complete: ${P} passed, ${F} failed`);
    console.log(`===========================================`);

    if (F > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
};

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});

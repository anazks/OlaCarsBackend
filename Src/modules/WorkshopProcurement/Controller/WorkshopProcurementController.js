const {
    addProcurementRequest,
    getProcurementRequests,
    getProcurementRequestById,
    updateProcurementRequest
} = require("../Repo/WorkshopProcurementRepo.js");
const { ROLES } = require("../../../shared/constants/roles.js");

exports.createRequest = async (req, res) => {
    try {
        const data = {
            ...req.body,
            requestedBy: req.user.id,
            requestedByRole: req.user.role,
            branch: req.user.branchId,
            requestNumber: `WR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
        };

        if (req.user.role === ROLES.WORKSHOPMANAGER || req.user.role === ROLES.BRANCHMANAGER) {
            data.status = "PENDING_FINANCE_APPROVAL";
        }

        if (!data.branch) {
            return res.status(400).json({ success: false, message: "Branch ID is required" });
        }

        const request = await addProcurementRequest(data);
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRequests = async (req, res) => {
    try {
        if (req.query.branchId) {
            req.query.branch = req.query.branchId;
            delete req.query.branchId;
        }

        const baseQuery = {};
        if (req.user.role === ROLES.WORKSHOPSTAFF || req.user.role === ROLES.WORKSHOPMANAGER || req.user.role === ROLES.BRANCHMANAGER) {
            baseQuery.branch = req.user.branchId;
        }

        const result = await getProcurementRequests(req.query, { baseQuery });
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.approveRequest = async (req, res) => {
    try {
        const { status, supplier, rejectionReason, quantity } = req.body;
        console.log("[DEBUG] approveRequest body:", req.body);

        if (!["APPROVED", "REJECTED", "PENDING_FINANCE_APPROVAL"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const updateData = {
            status,
            approvedBy: req.user.id,
            approvedByRole: req.user.role,
            supplier: status === "APPROVED" ? supplier : undefined,
            rejectionReason: status === "REJECTED" ? rejectionReason : undefined,
            quantity: status === "APPROVED" && quantity ? quantity : undefined
        };
        console.log("[DEBUG] approveRequest updateData:", updateData);

        const request = await updateProcurementRequest(req.params.id, updateData);
        if (!request) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRequestById = async (req, res) => {
    try {
        const request = await getProcurementRequestById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }
        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.auditProcurementRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { merchandiserPrice, documents, supplierDetails } = req.body;

        if (merchandiserPrice === undefined || merchandiserPrice === null) {
            return res.status(400).json({ success: false, message: "Proposed unit price is required for audit." });
        }

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id).populate("part");
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (!["APPROVED", "REJECTED", "PENDING_FINANCE_APPROVAL"].includes(request.status)) {
            return res.status(400).json({ success: false, message: `Request status must be APPROVED or REJECTED to submit audit. Current status: ${request.status}` });
        }

        const previousStatus = request.status;
        request.merchandiserPrice = Number(merchandiserPrice);
        request.merchandiserTotalAmount = Number(merchandiserPrice) * request.quantity;

        if (documents && Array.isArray(documents)) {
            request.documents = documents;
        }

        if (supplierDetails) {
            request.supplierDetails = {
                name: supplierDetails.name || "",
                email: supplierDetails.email || "",
                phone: supplierDetails.phone || "",
                address: supplierDetails.address || "",
            };
        }

        request.status = "PENDING_FINANCE_APPROVAL";

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user.id,
            editorRole: req.user.role,
            previousStatus: previousStatus,
            changesSummary: `Merchandiser completed workshop request audit. Proposed price: ${merchandiserPrice}. Documents uploaded: ${(documents || []).length}.`
        });

        await request.save();

        res.status(200).json({
            success: true,
            message: "Workshop Procurement Request audited and submitted for approval successfully.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.financeApproveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status. Must be APPROVED or REJECTED." });
        }

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id).populate("part");
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (request.status !== "PENDING_FINANCE_APPROVAL") {
            return res.status(400).json({ success: false, message: "Request is not in PENDING_FINANCE_APPROVAL status." });
        }

        // Enforce "No self-approval"
        if (request.requestedBy && request.requestedBy.toString() === approverId) {
            return res.status(403).json({ success: false, message: "You cannot approve your own Purchase Request." });
        }

        const previousStatus = request.status;
        const targetStatus = status === "APPROVED" ? "COST_APPROVED" : "REJECTED";
        request.status = targetStatus;
        request.approvedBy = approverId;
        request.approvedByRole = approverRole;

        if (status === "REJECTED") {
            request.rejectionReason = note || "";
        }

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary: status === "REJECTED" 
                ? `Finance rejected merchandiser pricing. Note: "${note || 'No note provided'}"` 
                : "Finance approved merchandiser pricing and auto-created the corresponding Purchase Order."
        };

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push(historyRecord);

        if (status === "APPROVED") {
            const PurchaseOrder = require("../../PurchaseOrder/Model/PurchaseOrderModel.js");
            const purchaseOrderNumber = `PO-PR-${request.requestNumber}`;
            
            const existingPO = await PurchaseOrder.findOne({ purchaseOrderNumber });
            if (!existingPO) {
                const totalAmt = request.merchandiserTotalAmount || (request.quantity * (request.merchandiserPrice || request.part?.unitCost || 0));
                const originalTotalAmt = request.originalTotalAmount || (request.quantity * (request.part?.unitCost || 0));
                const poData = {
                    purchaseOrderNumber,
                    status: "APPROVED",
                    purpose: "Spare Parts",
                    items: [
                        {
                            itemName: request.part?.partName || "Unknown Part",
                            quantity: request.quantity,
                            description: request.notes || `Workshop Procurement PR ${request.requestNumber}`,
                            unitPrice: request.merchandiserPrice || request.part?.unitCost || 0,
                            merchandiserPrice: request.merchandiserPrice || request.part?.unitCost || 0,
                            accountId: request.part?.purchaseAccountId || null,
                        }
                    ],
                    totalAmount: totalAmt,
                    merchandiserTotalAmount: totalAmt,
                    originalTotalAmount: originalTotalAmt,
                    branch: request.branch,
                    supplier: request.supplier,
                    supplierDetails: request.supplierDetails || null,
                    createdBy: request.requestedBy,
                    creatorRole: request.requestedByRole,
                    approvedBy: approverId,
                    approverRole: approverRole,
                    documents: request.documents || [],
                    approvalNote: note || "Auto-created from approved PR",
                    editHistory: [
                        {
                            editedAt: new Date(),
                            editedBy: approverId,
                            editorRole: approverRole,
                            previousStatus: "WAITING",
                            changesSummary: `Purchase Order auto-created from approved Workshop Procurement PR ${request.requestNumber}.`
                        }
                    ]
                };
                await PurchaseOrder.create(poData);
            }
        }

        await request.save();

        res.status(200).json({
            success: true,
            message: `Workshop Procurement Request successfully ${targetStatus === 'COST_APPROVED' ? 'approved and PO created' : 'rejected'}.`,
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.shipRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (request.status !== "COST_APPROVED") {
            return res.status(400).json({ success: false, message: "Request status must be COST_APPROVED to ship." });
        }

        const previousStatus = request.status;
        request.status = "IN_TRANSIT";

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary: "Merchandiser shipped procurement request. Status changed to IN_TRANSIT."
        };

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push(historyRecord);

        await request.save();

        res.status(200).json({
            success: true,
            message: "Workshop Procurement Request successfully shipped.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.receiveRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id);
        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (request.status !== "IN_TRANSIT") {
            return res.status(400).json({ success: false, message: "Request status must be IN_TRANSIT to receive." });
        }

        const previousStatus = request.status;
        request.status = "RECEIVED";

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary: "Workshop staff marked request as RECEIVED."
        };

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push(historyRecord);

        await request.save();

        res.status(200).json({
            success: true,
            message: "Workshop Procurement Request successfully received.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.addInventoryToStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { receivedQuantity } = req.body;
        const approverRole = req.user.role;
        const approverId = req.user.id;

        if (receivedQuantity === undefined || receivedQuantity < 0) {
            return res.status(400).json({ success: false, message: "Valid receivedQuantity is required." });
        }

        const WorkshopProcurement = require("../Model/WorkshopProcurementModel.js");
        const request = await WorkshopProcurement.findById(id).populate({
            path: "part",
            populate: [
                { path: "purchaseAccountId" },
                { path: "incomeAccountId" },
                { path: "taxId" }
            ]
        });

        if (!request) {
            return res.status(404).json({ success: false, message: "Procurement Request not found." });
        }

        if (request.status !== "RECEIVED") {
            return res.status(400).json({ success: false, message: "Request status must be RECEIVED to add inventory." });
        }

        if (request.inventoryAdded) {
            return res.status(400).json({ success: false, message: "Inventory has already been updated for this request." });
        }

        // 1. Update stock levels using receiveStock from InventoryService
        const { receiveStock } = require("../../Inventory/Service/InventoryService.js");
        await receiveStock(request.part._id, receivedQuantity, { id: approverId, role: approverRole });

        // 2. Resolve accounting codes and tax profiles
        const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel.js");
        const Tax = require("../../Tax/Model/TaxModel.js");

        let purchaseAccount = request.part?.purchaseAccountId;
        if (!purchaseAccount) {
            purchaseAccount = await AccountingCode.findOne({ code: "CGS0001" });
        }
        let incomeAccount = request.part?.incomeAccountId;
        if (!incomeAccount) {
            incomeAccount = await AccountingCode.findOne({ code: "IN0008" });
        }
        let taxProfile = request.part?.taxId;
        if (!taxProfile) {
            taxProfile = await Tax.findOne({ name: "ITBMS" });
        }

        // 3. Calculate exact, deficit, and surplus quantities/amounts
        const requestedQuantity = request.quantity || 0;
        const deficitQuantity = Math.max(0, requestedQuantity - receivedQuantity);
        const surplusQuantity = Math.max(0, receivedQuantity - requestedQuantity);

        // Cost calculations: prioritise merchandiserPrice over part.unitCost for PR stats
        const pricePerUnit = request.merchandiserPrice || (request.part && request.part.unitCost) || 0;
        const deficitAmount = deficitQuantity * pricePerUnit;
        const surplusAmount = surplusQuantity * pricePerUnit;

        // Ledger transactions should use the selling price of the Part Name (unitCost)
        const sellingPrice = (request.part && request.part.unitCost) || 0;
        const totalReceivedAmount = receivedQuantity * sellingPrice;

        // 4. Calculate inclusive tax metadata
        const taxRate = taxProfile ? taxProfile.rate : 7;
        const taxAmount = totalReceivedAmount - (totalReceivedAmount / (1 + taxRate / 100));
        const taxInfoObj = {
            taxApplied: taxProfile?._id || null,
            taxAmount: Number(taxAmount.toFixed(2)) || 0,
            isTaxInclusive: true
        };

        // 5. Create double-entry ledger records
        const LedgerEntry = require("../../Ledger/Model/LedgerEntryModel.js");
        const entries = [];

        if (totalReceivedAmount > 0) {
            if (purchaseAccount) {
                const debitEntry = await LedgerEntry.create({
                    branch: request.branch,
                    accountingCode: purchaseAccount._id,
                    type: "DEBIT",
                    amount: Number(totalReceivedAmount.toFixed(2)),
                    description: `Inventory received for PR ${request.requestNumber} - ${request.part?.partName || 'Part'}`,
                    entryDate: new Date(),
                    taxInfo: taxInfoObj,
                    createdBy: approverId,
                    creatorRole: approverRole
                });
                entries.push(debitEntry._id);
            }

            if (incomeAccount) {
                const creditEntry = await LedgerEntry.create({
                    branch: request.branch,
                    accountingCode: incomeAccount._id,
                    type: "CREDIT",
                    amount: Number(totalReceivedAmount.toFixed(2)),
                    description: `Inventory received for PR ${request.requestNumber} - ${request.part?.partName || 'Part'}`,
                    entryDate: new Date(),
                    taxInfo: taxInfoObj,
                    createdBy: approverId,
                    creatorRole: approverRole
                });
                entries.push(creditEntry._id);
            }
        }

        // 6. Update request with receipt details & ledger entry references
        request.receivedQuantity = receivedQuantity;
        request.deficitQuantity = deficitQuantity;
        request.deficitAmount = deficitAmount;
        request.surplusQuantity = surplusQuantity;
        request.surplusAmount = surplusAmount;
        request.ledgerEntries = entries;
        request.inventoryAdded = true;

        const previousStatus = request.status;
        let changesSummary = `Stock added to inventory. Received: ${receivedQuantity}.`;
        if (deficitQuantity > 0) {
            changesSummary += ` Deficit Qty: ${deficitQuantity}, Deficit Cost: $${deficitAmount.toFixed(2)}.`;
        } else if (surplusQuantity > 0) {
            changesSummary += ` Surplus Qty: ${surplusQuantity}, Surplus Cost: $${surplusAmount.toFixed(2)}.`;
        } else {
            changesSummary += ` Exact match received.`;
        }
        if (entries.length > 0) {
            changesSummary += ` Ledger entries recorded.`;
        }

        const historyRecord = {
            editedAt: new Date(),
            editedBy: approverId,
            editorRole: approverRole,
            previousStatus: previousStatus,
            changesSummary
        };

        if (!request.editHistory) request.editHistory = [];
        request.editHistory.push(historyRecord);

        await request.save();

        res.status(200).json({
            success: true,
            message: "Inventory successfully updated and ledger entries created.",
            data: request
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

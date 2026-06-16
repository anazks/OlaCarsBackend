const BillService = require("../Service/BillService");

exports.createBillFromPO = async (req, res, next) => {
    try {
        const { poId, ...overrides } = req.body;
        const bill = await BillService.createBillFromPO(poId, req.user, overrides);
        res.status(201).json({
            success: true,
            data: bill
        });
    } catch (error) {
        next(error);
    }
};

exports.getAllBills = async (req, res, next) => {
    try {
        const bills = await BillService.getAllBills(req.query);
        res.status(200).json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        next(error);
    }
};

exports.getBillById = async (req, res, next) => {
    try {
        const bill = await BillService.getBillById(req.params.id);
        if (!bill) {
            return res.status(404).json({
                success: false,
                message: "Bill not found"
            });
        }
        res.status(200).json({
            success: true,
            data: bill
        });
    } catch (error) {
        next(error);
    }
};

exports.recordBillPayment = async (req, res, next) => {
    try {
        const { billId } = req.params;
        const result = await BillService.recordBillPayment(billId, req.body, req.user);
        res.status(200).json({
            success: true,
            message: "Payment recorded successfully",
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.disposePO = async (req, res, next) => {
    try {
        const { poId } = req.params;
        const po = await BillService.disposePO(poId, req.user);
        res.status(200).json({
            success: true,
            message: "Purchase Order disposed successfully",
            data: po
        });
    } catch (error) {
        next(error);
    }
};

exports.createBill = async (req, res, next) => {
    try {
        const bill = await BillService.createBill(req.body, req.user);
        res.status(201).json({
            success: true,
            message: "Bill created successfully",
            data: bill
        });
    } catch (error) {
        next(error);
    }
};

exports.bulkUploadBills = async (req, res, next) => {
    try {
        const rows = req.body.rows || req.body;
        const actor = { id: req.user._id || req.user.id, role: req.user.role };
        const result = await BillService.bulkUploadBills(rows, actor, req.user.branchId);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

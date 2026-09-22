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
        const result = await BillService.getAllBills(req.query);
        res.status(200).json({
            success: true,
            count: result.pagination ? result.pagination.totalItems : result.data.length,
            data: result.data,
            pagination: result.pagination,
            metrics: result.metrics
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
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, message: "No data rows provided for bulk upload." });
        }
        const actor = { id: req.user._id || req.user.id, role: req.user.role };

        const isStreaming = req.headers.accept?.includes('application/x-ndjson') || 
                            req.headers['x-stream'] === 'true' || 
                            req.query.stream === 'true' || 
                            req.body.stream === true;

        if (isStreaming) {
            req.setTimeout(900000);
            if (res.socket) res.socket.setTimeout(900000);

            res.status(200);
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

            const onProgress = (prog) => {
                try {
                    res.write(JSON.stringify(prog) + '\n');
                } catch (writeErr) { /* client disconnected */ }
            };

            const result = await BillService.bulkUploadBills(rows, actor, req.user.branchId, onProgress);

            try {
                res.write(JSON.stringify({
                    type: 'complete',
                    success: true,
                    message: "Bulk upload completed",
                    totalCount: result.totalBills || (result.successCount + result.updatedCount + result.skippedCount + result.errorCount),
                    processedCount: result.totalBills || (result.successCount + result.updatedCount + result.skippedCount + result.errorCount),
                    insertedCount: result.successCount,
                    updatedCount: result.updatedCount,
                    skippedCount: result.skippedCount,
                    errorCount: result.errorCount,
                    percentage: 100,
                    statusMessage: `Upload complete: ${result.successCount} created, ${result.updatedCount} updated, ${result.skippedCount} skipped, ${result.errorCount} failed.`,
                    data: result
                }) + '\n');
            } catch (writeErr) {}
            res.end();
            return;
        }

        const result = await BillService.bulkUploadBills(rows, actor, req.user.branchId);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        if (!res.headersSent) {
            next(error);
        } else {
            try {
                res.write(JSON.stringify({ type: 'error', message: error.message || 'Upload failed' }) + '\n');
                res.end();
            } catch (e) {
                res.end();
            }
        }
    }
};

exports.updateBill = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedBill = await BillService.updateBill(id, req.body, req.user);
        res.status(200).json({
            success: true,
            message: "Bill updated successfully",
            data: updatedBill
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteBill = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await BillService.deleteBill(id, req.body, req.user);
        res.status(200).json(result);
    } catch (error) {
        if (error.requiresPaymentAction) {
            return res.status(400).json({
                success: false,
                requiresPaymentAction: true,
                amountPaid: error.amountPaid,
                hasOtherOpenBills: error.hasOtherOpenBills,
                otherOpenBills: error.otherOpenBills,
                message: error.message
            });
        }
        next(error);
    }
};

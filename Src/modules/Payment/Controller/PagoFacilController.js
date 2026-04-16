const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Driver } = require("../../Driver/Model/DriverModel");
const PaymentTransaction = require("../../Payment/Model/PaymentTransactionModel");
const AccountingCode = require("../../AccountingCode/Model/AccountingCodeModel");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_pagofacil_secret_key_123";
const PAGO_FACIL_USER = process.env.PAGO_FACIL_USER || "pagofacil";
const PAGO_FACIL_PASS = process.env.PAGO_FACIL_PASS || "pagofacil";

// Helper: Ensure RENT_PAYMENT accounting code exists
const getRentAccountingCode = async () => {
    let code = await AccountingCode.findOne({ code: "RENT_PAYMENT" });
    if (!code) {
        // Fallback or create dummy if possible
        // We will need a creator, let's find an Admin
        const Admin = mongoose.model("Admin");
        let admin = await Admin.findOne({});
        if (!admin) throw new Error("No admin found to create accounting code");

        code = await AccountingCode.create({
            code: "RENT_PAYMENT",
            name: "Driver Rent Payment",
            category: "INCOME",
            createdBy: admin._id,
            creatorRole: "Admin",
        });
    }
    return code;
};

// Authentication Middleware
exports.authenticatePagoFacil = (req, res, next) => {
    try {
        // 1. Check Authorization header (preferred)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            jwt.verify(token, JWT_SECRET);
            return next();
        }

        // 2. Fallback to body
        if (req.body.user === PAGO_FACIL_USER && req.body.password === PAGO_FACIL_PASS) {
            return next();
        }

        return res.status(401).json({
            cod_respuesta: "10",
            cod_severidad: "1",
            msg_respuesta: "Unauthorized",
            cod_operacion: req.body.cod_operacion || "0"
        });
    } catch (error) {
        console.error("PagoFacil Auth Error:", error.message);
        return res.status(401).json({
            cod_respuesta: "10",
            cod_severidad: "1",
            msg_respuesta: "Unauthorized or Token Expired",
            cod_operacion: req.body.cod_operacion || "0"
        });
    }
};

// Generate Token Endpoint
exports.generateToken = (req, res) => {
    const { userName, password, grant_type } = req.body;
    if (grant_type === "password" && userName === PAGO_FACIL_USER && password === PAGO_FACIL_PASS) {
        const token = jwt.sign({ role: "pagofacil" }, JWT_SECRET, { expiresIn: "2h" });
        return res.json({
            access_token: token,
            expires_in: "7200",
            token_type: "bearer"
        });
    }
    return res.status(400).json({ error: "invalid_grant" });
};

// 1. CONSULTA API
exports.consultaDebt = async (req, res) => {
    console.log("[PagoFacil] [CONSULTA] Request:", JSON.stringify(req.body));
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const hora = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHMMSS

    try {
        const searchParams = req.body.campos_busqueda && req.body.campos_busqueda[0];
        if (!searchParams) {
            const response = {
                tipo_operacion: "CashIn",
                cod_severidad: "1",
                cod_respuesta: "9",
                cod_operacion: "C",
                msg_respuesta: "Missing Parameters"
            };
            console.log("[PagoFacil] [CONSULTA] Response:", response);
            return res.json(response);
        }

        // Dynamically decide how to search
        let driver;
        if (searchParams.campo1) {
            // Try ID Number first
            driver = await Driver.findOne({ "identityDocs.idNumber": searchParams.campo1 });
            // If not found, try phone
            if (!driver) driver = await Driver.findOne({ "personalInfo.phone": searchParams.campo1 });
            // If not found, try as driver _id if it's a valid ObjectId
            if (!driver && mongoose.Types.ObjectId.isValid(searchParams.campo1)) {
                driver = await Driver.findById(searchParams.campo1);
            }
        }
        if (!driver && searchParams.campo2) {
            if (mongoose.Types.ObjectId.isValid(searchParams.campo2)) {
                driver = await Driver.findById(searchParams.campo2);
            } else {
                driver = await Driver.findOne({ "identityDocs.idNumber": searchParams.campo2 });
            }
        }

        if (!driver) {
            const response = {
                tipo_operacion: "CashIn",
                cod_severidad: "1",
                cod_respuesta: "7",
                cod_operacion: "C",
                msg_respuesta: "Customer Not Found"
            };
            console.log("[PagoFacil] [CONSULTA] Response:", response);
            return res.json(response);
        }

        // Calculate total rent due
        let totalDebt = 0;
        let oldestDueDate = null;
        driver.rentTracking.forEach(week => {
            if (week.status !== "PAID" && week.balance > 0) {
                totalDebt += week.balance;
                if (!oldestDueDate || (week.dueDate && week.dueDate < oldestDueDate)) {
                    oldestDueDate = week.dueDate;
                }
            }
        });

        if (totalDebt <= 0) {
            const response = {
                tipo_operacion: "CashIn",
                cod_severidad: "0",
                cod_respuesta: "6",
                cod_operacion: "C",
                msg_respuesta: "No Debt"
            };
            console.log("[PagoFacil] [CONSULTA] Response:", response);
            return res.json(response);
        }

        const importeString = Math.round(totalDebt * 100).toString();
        const codBarra = `9006${driver.identityDocs?.idNumber || '00000000'}${fecha}`;
        const fechaVencimiento = oldestDueDate 
            ? oldestDueDate.toISOString().slice(0, 10).replace(/-/g, "") 
            : fecha;

        const response = {
            tipo_operacion: "CashIn",
            cod_cliente: driver._id.toString().substring(0, 8),
            nom_cliente: driver.personalInfo.fullName,
            cod_severidad: "0",
            utility: req.body.utility || "90061234",
            terminal: req.body.terminal || "D00561",
            fecha: fecha,
            hora: hora,
            cod_operacion: "C",
            cod_respuesta: "0",
            msg_respuesta: "Consulta exitosa",
            items: [
                {
                    id_item: driver._id.toString(),
                    cod_barra: codBarra,
                    importe: importeString,
                    monto_abierto: "true", // Allow partial payments
                    texto_mostrar: "Driver Rent Payment",
                    orden: "1",
                    fecha_vencimiento: fechaVencimiento
                }
            ]
        };
        console.log("[PagoFacil] [CONSULTA] Response:", JSON.stringify(response));
        return res.json(response);

    } catch (error) {
        console.error("[PagoFacil] [CONSULTA] Exception:", error);
        return res.json({
            tipo_operacion: "CashIn",
            cod_severidad: "1",
            cod_respuesta: "10",
            cod_operacion: "C",
            msg_respuesta: "Internal Error"
        });
    }
};

// 2. DIRECTA API
exports.notifyPayment = async (req, res) => {
    console.log("[PagoFacil] [DIRECTA] Request:", JSON.stringify(req.body));
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10).replace(/-/g, "");
    const hora = now.toTimeString().slice(0, 8).replace(/:/g, "");
    
    try {
        const { cod_trx, importe, id_item, cod_cliente } = req.body;

        if (!cod_trx || !importe || (!id_item && !cod_cliente)) {
            const resp = {
                tipo_operacion: "CashIn",
                cod_operacion: "D",
                cod_severidad: "1",
                cod_respuesta: "9",
                msg_respuesta: "Missing Parameters"
            };
            console.log("[PagoFacil] [DIRECTA] Response:", resp);
            return res.json(resp);
        }

        // Idempotency check 
        const existingTx = await PaymentTransaction.findOne({ codTrx: cod_trx });
        if (existingTx) {
            // Already processed -> return success (safe retry)
            // or we could return Duplicate Key (2), but usually idempotency means 200 OK.
            // PagoFacil 2 Duplicate Key might mean "wait, you sent it twice", let's return 0 Success for idempotency.
            const resp = {
                tipo_operacion: "CashIn",
                utility: req.body.utility,
                terminal: req.body.terminal,
                fecha: fecha,
                hora: hora,
                secuencia: req.body.secuencia,
                cod_trx: cod_trx,
                cod_operacion: "D",
                cod_severidad: "0",
                cod_respuesta: "0",
                msg_respuesta: "Cobranza exitosa (Idempotent replay)",
                texto_ticket: "Payment recorded successfully"
            };
            console.log("[PagoFacil] [DIRECTA] Response:", resp);
            return res.json(resp);
        }

        // Find driver
        const searchId = id_item || cod_cliente;
        let driver;
        if (mongoose.Types.ObjectId.isValid(searchId)) {
            driver = await Driver.findById(searchId);
        } else {
            // Find by customer substring from consulta
            const drivers = await Driver.find({});
            driver = drivers.find(d => d._id.toString().substring(0, 8) === searchId);
        }

        if (!driver) {
            const resp = {
                tipo_operacion: "CashIn",
                cod_operacion: "D",
                cod_severidad: "1",
                cod_respuesta: "7",
                msg_respuesta: "Customer Not Found"
            };
            console.log("[PagoFacil] [DIRECTA] Response:", resp);
            return res.json(resp);
        }

        const amountReceived = Number(importe) / 100;
        let remainingToApply = amountReceived;

        // Apply payment FIFO to rent tracking
        for (const week of driver.rentTracking) {
            if (week.status !== "PAID" && week.balance > 0 && remainingToApply > 0) {
                const appliedToWeek = Math.min(week.balance, remainingToApply);
                
                week.payments.push({
                    amount: appliedToWeek,
                    paidAt: new Date(),
                    paymentMethod: "Cash",
                    transactionId: cod_trx,
                    note: `PagoFacil TX: ${cod_trx}`
                });

                // Recalculate
                const totalPaid = week.payments.reduce((sum, p) => sum + p.amount, 0);
                week.amountPaid = totalPaid;
                week.balance = week.totalDue - week.amountPaid;
                week.status = week.balance <= 0 ? "PAID" : "PARTIAL";
                if (week.balance <= 0) week.paidAt = new Date();

                remainingToApply -= appliedToWeek;
                if (remainingToApply <= 0) break;
            }
        }
        
        // Save driver changes
        await driver.save();

        // Create Payment Transaction
        let accountingCode;
        try {
            accountingCode = await getRentAccountingCode();
        } catch (err) {
            console.warn("Could not fetch Rent Payment accounting code, using admin directly:", err);
        }

        await PaymentTransaction.create({
            accountingCode: accountingCode ? accountingCode._id : (await AccountingCode.findOne({}))?._id, // fallback
            referenceId: driver._id,
            referenceModel: "Driver",
            transactionCategory: "INCOME",
            transactionType: "CREDIT",
            baseAmount: amountReceived,
            totalAmount: amountReceived,
            paymentMethod: "CASH",
            status: "COMPLETED",
            notes: `PagoFacil CashIn (${req.body.terminal})`,
            codTrx: cod_trx,
            createdBy: driver.createdBy, // Attribute to same creator roughly
            creatorRole: driver.creatorRole
        });

        const resp = {
            tipo_operacion: "CashIn",
            utility: req.body.utility,
            terminal: req.body.terminal,
            fecha: fecha,
            hora: hora,
            secuencia: req.body.secuencia,
            cod_trx: cod_trx,
            cod_operacion: "D",
            cod_severidad: "0",
            cod_respuesta: "0",
            msg_respuesta: "Cobranza exitosa",
            texto_ticket: "Payment recorded successfully"
        };
        console.log("[PagoFacil] [DIRECTA] Response:", JSON.stringify(resp));
        return res.json(resp);

    } catch (error) {
        console.error("[PagoFacil] [DIRECTA] Exception:", error);
        return res.json({
            tipo_operacion: "CashIn",
            cod_operacion: "D",
            cod_severidad: "1",
            cod_respuesta: "10",
            msg_respuesta: "Internal Error"
        });
    }
};

// 3. REVERSA API
exports.reversePayment = async (req, res) => {
    console.log("[PagoFacil] [REVERSA] Request:", JSON.stringify(req.body));
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10).replace(/-/g, "");
    const hora = now.toTimeString().slice(0, 8).replace(/:/g, "");

    try {
        const { cod_trx } = req.body;
        if (!cod_trx) {
            const resp = {
                tipo_operacion: "CashIn",
                cod_operacion: "R",
                cod_severidad: "1",
                cod_respuesta: "9",
                msg_respuesta: "Missing Parameters"
            };
            console.log("[PagoFacil] [REVERSA] Response:", resp);
            return res.json(resp);
        }

        const transaction = await PaymentTransaction.findOne({ codTrx: cod_trx });
        if (!transaction) {
            const resp = {
                tipo_operacion: "CashIn",
                cod_operacion: "R",
                cod_severidad: "1",
                cod_respuesta: "4",
                msg_respuesta: "Transaction Not Found"
            };
            console.log("[PagoFacil] [REVERSA] Response:", resp);
            return res.json(resp);
        }
        
        // Edge Case: Already reversed
        if (transaction.status === "CANCELLED") {
            const resp = {
                tipo_operacion: "CashIn",
                utility: req.body.utility,
                terminal: req.body.terminal,
                fecha: fecha,
                hora: hora,
                secuencia: req.body.secuencia,
                cod_trx: cod_trx,
                cod_operacion: "R",
                cod_respuesta: "0", // Returning success instead of 3 for idempotency safety
                cod_severidad: "0",
                msg_respuesta: "Already Reversed"
            };
            console.log("[PagoFacil] [REVERSA] Response:", resp);
            return res.json(resp);
        }

        const driverId = transaction.referenceId;
        const driver = await Driver.findById(driverId);
        if (driver) {
            // Remove matching payments from rentTracking and recalculate
            driver.rentTracking.forEach(week => {
                const initialLength = week.payments.length;
                week.payments = week.payments.filter(p => String(p.transactionId) !== String(cod_trx));
                
                if (week.payments.length !== initialLength) {
                    // Recalculate amounts
                    const totalPaid = week.payments.reduce((sum, p) => sum + p.amount, 0);
                    week.amountPaid = totalPaid;
                    week.balance = week.totalDue - week.amountPaid;
                    week.status = week.balance === 0 ? "PAID" : (week.balance === week.totalDue ? "PENDING" : "PARTIAL");
                    if (week.status !== "PAID") week.paidAt = null;
                }
            });
            await driver.save();
        }

        // Cancel transaction
        transaction.status = "CANCELLED";
        await transaction.save();

        const resp = {
            tipo_operacion: "CashIn",
            utility: req.body.utility,
            terminal: req.body.terminal,
            fecha: fecha,
            hora: hora,
            secuencia: req.body.secuencia,
            cod_trx: cod_trx,
            cod_operacion: "R",
            cod_respuesta: "0",
            cod_severidad: "0",
            msg_respuesta: "Transaction reversed successfully"
        };
        console.log("[PagoFacil] [REVERSA] Response:", JSON.stringify(resp));
        return res.json(resp);

    } catch (error) {
        console.error("[PagoFacil] [REVERSA] Exception:", error);
        return res.json({
            tipo_operacion: "CashIn",
            cod_operacion: "R",
            cod_severidad: "1",
            cod_respuesta: "10",
            msg_respuesta: "Internal Error"
        });
    }
};

// 4. DEVELOPMENT TESTING API (Simulate a Cash-In)
exports.testAutoPay = async (req, res) => {
    // Only allow in development environments, or you can remove this check if you need it on a staging server
    if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ success: false, message: "Testing endpoints disabled in production." });
    }

    try {
        const driverId = req.params.driverId;
        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        // Calculate total debt to automatically pay it all, or default to a dummy amount
        let totalDebt = 0;
        driver.rentTracking.forEach(week => {
            if (week.status !== "PAID" && week.balance > 0) {
                totalDebt += week.balance;
            }
        });

        if (totalDebt <= 0) {
            return res.status(400).json({ success: false, message: "Driver has zero debt. Nothing to test." });
        }

        // Fake the direct notification body
        req.body = {
            user: PAGO_FACIL_USER,
            password: PAGO_FACIL_PASS,
            tipo_operacion: "CashIn",
            cod_cliente: driverId.substring(0, 8),
            id_item: driverId,
            importe: Math.round(totalDebt * 100).toString(),
            cod_trx: "TEST_TRX_" + Date.now(),
            terminal: "DEV_FRONTEND",
            secuencia: Math.floor(Math.random() * 9000) + 1000
        };

        // Call the exact same Directa API logic securely to process it identically
        console.log("🛠️ TEST AUTO-PAY TRIGGERED for Driver:", driverId);
        return exports.notifyPayment(req, res);

    } catch (error) {
        console.error("[PagoFacil] [TEST-PAY] Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

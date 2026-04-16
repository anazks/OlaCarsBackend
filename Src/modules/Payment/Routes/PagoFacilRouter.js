const express = require("express");
const router = express.Router();
const {
    authenticatePagoFacil,
    generateToken,
    consultaDebt,
    notifyPayment,
    reversePayment,
    testAutoPay
} = require("../Controller/PagoFacilController");

/**
 * @swagger
 * tags:
 *   name: PagoFacil
 *   description: Pago Facil API for CashIn
 */

// Token Generation
router.post("/auth/token", generateToken);

// Development Testing Endpoint (Do not use in production)
router.post("/test-auto-pay/:driverId", testAutoPay);

// Operations with Authentication Middleware
router.post("/consulta", authenticatePagoFacil, consultaDebt);
router.post("/directa", authenticatePagoFacil, notifyPayment);
router.post("/reversa", authenticatePagoFacil, reversePayment);

module.exports = router;

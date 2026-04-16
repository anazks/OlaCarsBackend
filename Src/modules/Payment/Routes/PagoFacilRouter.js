const express = require("express");
const router = express.Router();
const {
    authenticatePagoFacil,
    generateToken,
    consultaDebt,
    notifyPayment,
    reversePayment
} = require("../Controller/PagoFacilController");

/**
 * @swagger
 * tags:
 *   name: PagoFacil
 *   description: Pago Facil API for CashIn
 */

// Token Generation
router.post("/auth/token", generateToken);

// Operations with Authentication Middleware
router.post("/consulta", authenticatePagoFacil, consultaDebt);
router.post("/directa", authenticatePagoFacil, notifyPayment);
router.post("/reversa", authenticatePagoFacil, reversePayment);

module.exports = router;

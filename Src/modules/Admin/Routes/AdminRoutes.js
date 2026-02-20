const express = require ("express")
const router = express.Router();
const {login,refreshToken} = require ('../Controller/AdminController.js')


router.route("/login").post(login);
router.post("/refresh", refreshToken);
module.exports = router;
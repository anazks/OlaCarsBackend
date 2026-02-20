const express = require ("express")
const router = express.Router();
const {login} = require ('../Controller/AdminController.js')


router.route("/login").post(login);

module.exports = router;
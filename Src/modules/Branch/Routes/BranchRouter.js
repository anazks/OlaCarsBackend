const express = require ("express")
const router = express.Router();
const { addBranch } = require('../Controller/BranchController.js');
const { authorize } = require('../../../shared/middlewares/roleMiddleWare.js');
const {authenticate} = require('../../../shared/middlewares/authMiddleware.js')
router.route('/admin/branch').post(authenticate, authorize("SUPER_ADMIN"), addBranch)
router.route('/admin/branch').get(authenticate, authorize("SUPER_ADMIN"))
router.route('/admin/branch/:id').get(authenticate, authorize("SUPER_ADMIN"))
router.route('/admin/branch/:id').put(authenticate, authorize("SUPER_ADMIN"))
router.route('/admin/branch/:id').delete(authenticate, authorize("SUPER_ADMIN"))

module.exports = router;
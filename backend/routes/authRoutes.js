const express = require("express");
const { body } = require("express-validator");
const { login, me, registerExporter } = require("../controllers/authController");
const {
	requestReset,
	verifyReset,
	resetPassword,
	listResetLogs
} = require("../controllers/passwordResetController");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { handleValidation } = require("../Midleware/validate");

const router = express.Router();

router.post(
	"/login",
	body("email").trim().toLowerCase().isEmail(),
	body("password").isLength({ min: 6 }),
	handleValidation,
	login
);
router.post(
	"/register",
	body("full_name").notEmpty(),
	body("email").trim().toLowerCase().isEmail(),
	body("password").isLength({ min: 6 }),
	handleValidation,
	registerExporter
);
router.get("/me", authRequired, me);

/* ── Password reset flow ───────────────────────────────────────────────────
   POST /api/auth/forgot-password   { identifier, captcha? }
   POST /api/auth/verify-reset-code { identifier, code }   → { reset_token }
   POST /api/auth/reset-password    { reset_token, new_password }
   GET  /api/auth/password-reset-logs (admin only)
*/
router.post(
	"/forgot-password",
	body("identifier").isString().trim().notEmpty().withMessage("identifier is required"),
	handleValidation,
	requestReset
);
router.post(
	"/verify-reset-code",
	body("identifier").isString().trim().notEmpty(),
	body("code").isString().trim().isLength({ min: 4, max: 12 }),
	handleValidation,
	verifyReset
);
router.post(
	"/reset-password",
	body("reset_token").isString().trim().isLength({ min: 16 }),
	body("new_password").isString().isLength({ min: 8 }),
	handleValidation,
	resetPassword
);
router.get(
	"/password-reset-logs",
	authRequired,
	requireRoles("admin"),
	listResetLogs
);

module.exports = router;

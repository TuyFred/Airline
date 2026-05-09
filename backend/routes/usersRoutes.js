const express = require("express");
const { body } = require("express-validator");
const { listUsers, listLockHistory, getUser, lockOrUnlockUser, createUser, updateUser, deleteUser } = require("../controllers/usersController");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { handleValidation } = require("../Midleware/validate");

const router = express.Router();

router.use(authRequired, requireRoles("admin"));
router.get("/", listUsers);
router.get("/lock-history", listLockHistory);
router.get("/:id", getUser);
router.post(
	"/",
	body("full_name").trim().notEmpty(),
	body("email").isEmail(),
	body("password").isLength({ min: 6 }),
	body("role").isIn(["exporter", "airline_analyst", "airline_supervisor", "clearing_agent", "admin"]),
	body("linked_airline")
		.optional({ nullable: true })
		.custom((value, { req }) => {
			if (["airline_analyst", "airline_supervisor"].includes(req.body.role) && !String(value || "").trim()) {
				throw new Error("linked_airline is required for airline_analyst and airline_supervisor");
			}
			return true;
		}),
	handleValidation,
	createUser
);
router.patch(
	"/:id/lock",
	body("is_locked").isBoolean(),
	body("whatsapp_contact").optional({ nullable: true, checkFalsy: true }).isString().isLength({ min: 7, max: 20 }),
	body("lock_reason").optional({ nullable: true, checkFalsy: true }).isString().isLength({ min: 3, max: 255 }),
	body("admin_message").optional({ nullable: true, checkFalsy: true }).isString().isLength({ min: 3, max: 1000 }),
	handleValidation,
	lockOrUnlockUser
);
router.patch(
	"/:id",
	body("full_name").trim().notEmpty(),
	body("email").isEmail(),
	body("role").isIn(["exporter", "airline_analyst", "airline_supervisor", "clearing_agent", "admin"]),
	body("linked_airline")
		.optional({ nullable: true })
		.custom((value, { req }) => {
			if (["airline_analyst", "airline_supervisor"].includes(req.body.role) && !String(value || "").trim()) {
				throw new Error("linked_airline is required for airline_analyst and airline_supervisor");
			}
			return true;
		}),
	body("password").optional({ nullable: true, checkFalsy: true }).isLength({ min: 6 }),
	handleValidation,
	updateUser
);
router.delete("/:id", deleteUser);

module.exports = router;

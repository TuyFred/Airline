const express = require("express");
const { body } = require("express-validator");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { handleValidation } = require("../Midleware/validate");
const { listAirlines, createAirline, updateAirline, deleteAirline } = require("../controllers/airlinesController");

const router = express.Router();

router.use(authRequired);

router.get("/", requireRoles("admin"), listAirlines);
router.post(
  "/",
  requireRoles("admin"),
  body("name").notEmpty(),
  body("code").optional({ nullable: true }).isString(),
  handleValidation,
  createAirline
);
router.patch(
  "/:id",
  requireRoles("admin"),
  body("name").notEmpty(),
  body("code").optional({ nullable: true }).isString(),
  handleValidation,
  updateAirline
);
router.delete("/:id", requireRoles("admin"), deleteAirline);

module.exports = router;
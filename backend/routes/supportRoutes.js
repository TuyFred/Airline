const express = require("express");
const { body } = require("express-validator");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { handleValidation } = require("../Midleware/validate");
const { sendSupportEmail, sendPublicSupportEmail, sendAdminEmailToUser } = require("../controllers/supportController");

const router = express.Router();

router.post(
  "/public-email",
  body("fullName").trim().notEmpty().withMessage("fullName is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("subject").optional().isString(),
  body("issue").optional().isString(),
  body("companyName").optional().isString(),
  body("flightDate").optional().isString(),
  body("issueDescription").trim().notEmpty().withMessage("issueDescription is required"),
  body("contactNumber").optional().isString(),
  body("emailMessage").optional().isString(),
  handleValidation,
  sendPublicSupportEmail
);

router.use(authRequired);

router.post(
  "/email",
  body("subject").optional().isString(),
  body("issue").optional().isString(),
  body("companyName").optional().isString(),
  body("flightDate").optional().isString(),
  body("issueDescription").optional().isString(),
  body("contactNumber").optional().isString(),
  body("emailMessage").optional().isString(),
  handleValidation,
  sendSupportEmail
);

router.post(
  "/admin-email",
  requireRoles("admin"),
  body("recipientEmail").isEmail(),
  body("subject").optional().isString(),
  body("issueDescription").optional().isString(),
  handleValidation,
  sendAdminEmailToUser
);

module.exports = router;

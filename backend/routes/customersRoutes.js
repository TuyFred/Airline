const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authRequired, requireRoles } = require("../Midleware/auth");
const {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer
} = require("../controllers/customersController");

const uploadsDir = path.join(process.cwd(), "uploads", "customers");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      return cb(new Error("Logo must be an image file"));
    }
    return cb(null, true);
  }
});

function handleUploadError(error, req, res, next) {
  if (!error) return next();
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "Logo must be 8 MB or smaller" });
  }
  return res.status(400).json({ message: error.message || "Logo upload failed" });
}

const router = express.Router();

router.get("/", authRequired, requireRoles("admin"), listCustomers);
router.post(
  "/",
  authRequired,
  requireRoles("admin"),
  (req, res, next) => upload.single("logo")(req, res, (error) => handleUploadError(error, req, res, next)),
  createCustomer
);
router.patch(
  "/:id",
  authRequired,
  requireRoles("admin"),
  (req, res, next) => upload.single("logo")(req, res, (error) => handleUploadError(error, req, res, next)),
  updateCustomer
);
router.delete("/:id", authRequired, requireRoles("admin"), deleteCustomer);

module.exports = router;

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { getHeroMedia, uploadHeroMedia, setHeroMediaMute } = require("../controllers/mediaController");
const { enforcePublicMaintenance } = require("../services/systemSettings");

const uploadsDir = path.join(process.cwd(), "uploads", "hero-media");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`)
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("video/") && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image or video files are allowed"));
    }
    return cb(null, true);
  }
});

function handleUploadError(error, req, res, next) {
  if (!error) return next();

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "File must be 100 MB or smaller" });
  }

  return res.status(400).json({ message: error.message || "Media upload failed" });
}

const router = express.Router();

router.get("/hero", enforcePublicMaintenance, getHeroMedia);
router.post(
  "/hero",
  authRequired,
  requireRoles("admin"),
  (req, res, next) => upload.any()(req, res, (error) => handleUploadError(error, req, res, next)),
  uploadHeroMedia
);
router.patch("/hero/mute", authRequired, requireRoles("admin"), setHeroMediaMute);

module.exports = router;

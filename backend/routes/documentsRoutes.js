const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { uploadDocument, listDocuments, createShareLink, getDocumentById, streamDocumentContent } = require("../controllers/documentsController");
const { authRequired, requireRoles } = require("../Midleware/auth");

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`)
});

const upload = multer({ storage });
const router = express.Router();

router.use(authRequired);
router.get("/", listDocuments);
router.get("/:id", requireRoles("exporter", "clearing_agent", "admin", "airline_analyst", "airline_supervisor"), getDocumentById);
router.get("/:id/content", requireRoles("exporter", "clearing_agent", "admin", "airline_analyst", "airline_supervisor"), streamDocumentContent);
router.post(
  "/upload",
  requireRoles("exporter", "clearing_agent", "admin"),
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 20 }
  ]),
  uploadDocument
);
router.post("/:id/share-link", requireRoles("exporter", "clearing_agent", "admin"), createShareLink);

module.exports = router;

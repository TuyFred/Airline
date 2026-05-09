const express = require("express");
const { listCapacity, upsertCapacity, releaseCapacity, deleteCapacity } = require("../controllers/capacityController");
const { authRequired, requireRoles } = require("../Midleware/auth");

const router = express.Router();

router.get("/", authRequired, listCapacity);
router.post("/upsert", authRequired, requireRoles("airline_analyst", "airline_supervisor", "admin"), upsertCapacity);
router.post("/release", authRequired, requireRoles("airline_analyst", "airline_supervisor", "admin"), releaseCapacity);
router.delete("/:id", authRequired, requireRoles("admin"), deleteCapacity);

module.exports = router;

require("dotenv").config();

const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Server } = require("socket.io");

const apiRoutes = require("./routes");
const { query } = require("./config/db");
const { notFound, errorHandler } = require("./Midleware/errorHandler");
const { initSocket } = require("./config/socket");
const { startScheduler } = require("./services/scheduler");
const { ensureAdminUser } = require("./services/adminBootstrap");
const { runMigrations } = require("./services/migrations");

const isProd = process.env.NODE_ENV === "production";
const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Allowed CORS origins: production uses the real domain; dev allows localhost Vite ports
const ALLOWED_ORIGINS = isProd
  ? (configuredOrigins.length
      ? configuredOrigins
      : [
          process.env.APP_URL || "https://sbuexport.com",
          "https://www.sbuexport.com"
        ].filter(Boolean))
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4000",
      "http://127.0.0.1:5173"
    ];

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isProd ? ALLOWED_ORIGINS : "*",
    methods: ["GET", "POST", "PATCH"]
  }
});

initSocket(io);

io.on("connection", (socket) => {
  socket.on("register:user", ({ userId }) => {
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // React SPA manages its own CSP
  })
);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (!isProd) return callback(null, true); // dev: allow all
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

// Browsers (and cPanel defaults) often request /favicon.ico first. Without a real file,
// the SPA fallback below would send index.html and the tab shows a wrong/generic icon.
const publicFaviconSvg = path.join(__dirname, "public", "favicon.svg");
app.get("/favicon.ico", (req, res, next) => {
  if (fs.existsSync(publicFaviconSvg)) {
    res.type("image/svg+xml");
    res.set("Cache-Control", "public, max-age=604800");
    return res.sendFile(publicFaviconSvg);
  }
  next();
});

if (!isProd) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Serve uploaded files (documents, images, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check (always available before API routes)
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Health OK", service: "SBU Air Cargo API", env: process.env.NODE_ENV || "development" });
});

// Public document sharing (no authentication required)
const { streamPublicDocument } = require("./controllers/documentsController");
app.get("/api/public/documents/:token", streamPublicDocument);

// API routes
app.use("/api", apiRoutes);

// ── Production: serve the built React SPA ────────────────────────────────────
// Build the React app locally with:  npm run build (inside frontend/)
// Then copy the entire frontend/dist/ content into backend/public/ before deploying.
if (isProd) {
  // Look for static files in ./public/ (recommended cPanel layout)
  // OR fall back to ../frontend/dist/ (if keeping repo structure on server)
  const publicDir = path.join(__dirname, "public");
  const distDir   = path.join(__dirname, "..", "frontend", "dist");

  const staticRoot = fs.existsSync(publicDir)
    ? publicDir
    : fs.existsSync(distDir)
      ? distDir
      : null;

  if (staticRoot) {
    console.log(`Serving React SPA from: ${staticRoot}`);
    app.use(express.static(staticRoot));

    // SPA fallback: every non-API, non-upload request returns index.html
    app.use((req, res) => {
      res.sendFile(path.join(staticRoot, "index.html"));
    });
  } else {
    console.warn("No React build found. Run `npm run build` inside the frontend folder and copy dist/ to backend/public/");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

startScheduler();

const PORT = Number(process.env.PORT || 4000);

async function startServer() {
  try {
    await query("SELECT 1");
    await runMigrations();
    await ensureAdminUser();
    console.log("Database connected successfully");

    server.listen(PORT, () => {
      console.log(`SBU Air Cargo API running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
      if (isProd) {
        console.log(`Production URL: ${process.env.APP_URL || "https://sbuexport.com"}`);
      }
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

startServer();

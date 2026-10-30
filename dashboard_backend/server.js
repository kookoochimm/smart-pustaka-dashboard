import "dotenv/config";
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import { createDashboardController } from "./dashboard_controller.js";

const app = express();
const PORT = Number(process.env.PORT || 5002);

// Set CORS_ORIGINS to comma-separated frontend origins in Render.
// Example: https://smart-pustaka-dashboard.pages.dev
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without Origin (health checks / server-to-server) are allowed.
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS."));
    },
  })
);
app.use(express.json({ limit: "45mb" }));
app.use(express.urlencoded({ extended: true, limit: "45mb" }));

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  console.warn("Database environment variables are incomplete. Configure DB_HOST, DB_USER and DB_NAME.");
}

const sslConfig = process.env.DB_SSL_CA
  ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true }
  : process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false }
    : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "library_db",
  ...(sslConfig ? { ssl: sslConfig } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "dashboard", database: "connected" });
  } catch (error) {
    console.error("Health check database error:", error.message);
    res.status(503).json({ status: "error", service: "dashboard", database: "disconnected" });
  }
});

app.use("/api", createDashboardController(pool));

app.use((err, _req, res, _next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ message: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SMART PUSTAKA dashboard backend listening on port ${PORT}`);
});

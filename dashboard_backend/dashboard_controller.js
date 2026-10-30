
import express from "express";
import { randomUUID } from "node:crypto";

export function createDashboardController(pool) {
  const router = express.Router();

  // State untuk RFID login, Menu User dan Menu Book
  const state = {
    authMode: false,
    authResult: null,
    userMode: false,
    pendingUser: null,
    bookMode: false,
    pendingBook: null,
    adminScanMode: false,
    adminScanResult: null,
  };

  const sessions = new Set();
  const sessionAdminIds = new Map();

  const normalizeUID = (v) =>
    String(v ?? "").replace(/\s+/g, "").trim().toUpperCase();

  const isUID = (v, length) =>
    new RegExp(`^[0-9A-F]{${length}}$`).test(v);

  // RC522 tags may expose 4-byte (8 hex) or 7-byte (14 hex) UIDs.
  const isBookUID = (v) => isUID(v, 8) || isUID(v, 14);

  const asyncRoute = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  const requireAdmin = (req, res, next) => {
    const token = String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    if (!token || !sessions.has(token)) {
      return res.status(401).json({
        message: "Please log in as ADMIN.",
      });
    }

    next();
  };

  // RFID scan daripada ESP32
  router.post(
    "/rfid/scan",
    asyncRoute(async (req, res) => {
      const uid = normalizeUID(req.body?.uid);

      if (!/^[0-9A-F]+$/.test(uid)) {
        return res.status(400).json({
          message: "Invalid RFID UID.",
        });
      }

      // ADMIN LOGIN
      if (state.authMode) {
        if (!isUID(uid, 8)) {
          state.authResult = {
            status: "error",
            message:
              "Login requires an 8-character ADMIN card UID.",
          };

          return res.json({
            received: true,
            mode: "login",
          });
        }

        const [rows] = await pool.query(
          `SELECT admin_id, username, uid, role
           FROM admins
           WHERE uid = ?
           LIMIT 1`,
          [uid]
        );

        if (!rows.length) {
          state.authResult = {
            status: "error",
            message:
              "Access denied. This card is not registered as an admin.",
          };
        } else {
          const admin = rows[0];
          const token = randomUUID();

          sessions.add(token);
          sessionAdminIds.set(token, admin.admin_id);

          state.authResult = {
            status: "success",
            token,
            user: {
              user_id: admin.admin_id,
              admin_id: admin.admin_id,
              uid: admin.uid,
              fullname: admin.username,
              username: admin.username,
              role: admin.role,
              figure: admin.figure || null,
            },
          };
        }

        return res.json({
          received: true,
          mode: "login",
        });
      }

      // MENU ADMIN: scan UID kad baharu untuk tambah/replace kad admin
      if (state.adminScanMode) {
        if (!isUID(uid, 8)) {
          state.adminScanResult = { status: "error", message: "Admin card UID must contain exactly 8 hexadecimal characters." };
          return res.json({ received: false, mode: "admin" });
        }
        const [duplicates] = await pool.query("SELECT admin_id FROM admins WHERE uid = ? LIMIT 1", [uid]);
        if (duplicates.length) {
          state.adminScanResult = { status: "error", message: "This RFID card is already registered to an admin." };
        } else {
          state.adminScanResult = { status: "success", uid };
          state.adminScanMode = false;
        }
        return res.json({ received: true, mode: "admin" });
      }

      // MENU USER: UID 8 aksara hexadecimal
      if (state.userMode) {
        if (!isUID(uid, 8)) {
          return res.json({
            received: false,
            message:
              "Menu User accepts only 8-character UID.",
          });
        }

        const [rows] = await pool.query(
          `SELECT user_id, uid, fullname, username,
                  matric_number, role, program
           FROM users
           WHERE uid = ? AND is_deleted = 0
           LIMIT 1`,
          [uid]
        );

        state.pendingUser = rows.length
          ? {
              uid,
              status:
                String(rows[0].username).toUpperCase() ===
                "ADMIN"
                  ? "admin"
                  : "exists",
              user: rows[0],
            }
          : {
              uid,
              status: "unknown",
              user: null,
            };

        return res.json({
          received: true,
          mode: "user",
        });
      }

      // MENU BOOK: support 8- or 14-character hexadecimal UID
      if (state.bookMode) {
        if (!isBookUID(uid)) {
          return res.json({
            received: false,
            message: "Menu Book accepts 8- or 14-character hexadecimal UID.",
          });
        }

        const [rows] = await pool.query(
          `SELECT *
           FROM books
           WHERE uid = ?
           LIMIT 1`,
          [uid]
        );

        state.pendingBook = {
          pendingUid: uid,
          scanStatus: rows.length ? "exists" : "unknown",
          book: rows[0] || null,
        };

        return res.json({
          received: true,
          mode: "book",
        });
      }

      return res.status(409).json({
        message: "No dashboard RFID scan mode is active.",
      });
    })
  );

  // LOGIN RFID MODE
  router.post("/dashboard-auth/scan-mode", (req, res) => {
    state.authMode = Boolean(req.body?.active);
    if (state.authMode) {
      state.userMode = false;
      state.bookMode = false;
      state.adminScanMode = false;
      state.pendingUser = null;
      state.pendingBook = null;
      state.adminScanResult = null;
      state.authResult = null;
    }

    res.json({
      active: state.authMode,
    });
  });

  router.get("/dashboard-auth/scan-result", (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    const result = state.authResult;
    state.authResult = null;

    res.json({ result });
  });

  // LOGIN ADMIN MENGGUNAKAN PASSWORD
  router.post(
    "/auth/login",
    asyncRoute(async (req, res) => {
      const username = String(
        req.body?.username ?? ""
      ).trim();

      const password = String(
        req.body?.password ?? ""
      );

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: "Please enter both username and password.",
        });
      }

      // Login dibenarkan hanya jika username dan password sepadan
      // dengan rekod dalam library_db.admins.
      const [rows] = await pool.query(
        `SELECT admin_id, username, uid, role, figure, created_at
         FROM admins
         WHERE username = ? AND password = ?
         LIMIT 1`,
        [username, password]
      );

      if (!rows.length) {
        return res.status(401).json({
          success: false,
          message: "Username or password is incorrect, or the admin account does not exist.",
        });
      }

      const admin = rows[0];
      const token = randomUUID();
      sessions.add(token);
      sessionAdminIds.set(token, admin.admin_id);

      res.json({
        success: true,
        token,
        user: {
          user_id: admin.admin_id,
          admin_id: admin.admin_id,
          uid: admin.uid,
          fullname: admin.username,
          username: admin.username,
          role: admin.role,
          figure: admin.figure || null,
          created_at: admin.created_at,
        },
      });
    })
  );

  // MENU USER RFID MODE
  router.post(
    "/users/registration-mode",
    requireAdmin,
    (req, res) => {
      state.userMode = Boolean(req.body?.active);
      if (state.userMode) {
        state.authMode = false;
        state.bookMode = false;
        state.adminScanMode = false;
        state.authResult = null;
        state.pendingBook = null;
        state.adminScanResult = null;
      }
      state.pendingUser = null;

      res.json({
        active: state.userMode,
      });
    }
  );

  router.get(
    "/users/pending-card",
    requireAdmin,
    (_req, res) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      const result = state.pendingUser;
      state.pendingUser = null;

      res.json(result || {});
    }
  );

  // MENU BOOK RFID MODE
  router.post(
    "/books/scan-mode",
    requireAdmin,
    (req, res) => {
      state.bookMode = Boolean(req.body?.active);
      if (state.bookMode) {
        state.authMode = false;
        state.userMode = false;
        state.adminScanMode = false;
        state.authResult = null;
        state.pendingUser = null;
        state.adminScanResult = null;
      }
      state.pendingBook = null;

      res.json({
        active: state.bookMode,
      });
    }
  );

  router.get(
    "/books/scan-mode",
    requireAdmin,
    (_req, res) => {
      const result = state.pendingBook;
      state.pendingBook = null;

      res.json(
        result || {
          pendingUid: "",
          scanStatus: "idle",
        }
      );
    }
  );

  // PAPAR SENARAI USER
  router.get(
    "/users",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        `SELECT user_id, uid, fullname, username,
                matric_number, role, program, is_deleted
         FROM users
         WHERE is_deleted = 0
         ORDER BY fullname`
      );

      res.json(rows);
    })
  );

  // EDIT USER - BAHAGIAN AWAL
  router.put(
    "/users/:id",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const userId = Number(req.params.id);

      const fullname = String(
        req.body?.fullname ?? ""
      ).trim();

      const username = String(
        req.body?.username ?? ""
      ).trim();

      const matric = String(
        req.body?.matric_number ?? ""
      ).trim();

      const program =
        String(req.body?.program ?? "-").trim() || "-";

      const password = String(
        req.body?.password ?? ""
      );

      
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user ID."
      });
    }

    if (!fullname || !username || !matric) {
      return res.status(400).json({
        message: "Full name, username and matric number are required."
      });
    }

    const [users] = await pool.query(
      "SELECT user_id FROM users WHERE user_id = ? AND is_deleted = 0",
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    const [duplicates] = await pool.query(
      `SELECT user_id
       FROM users
       WHERE username = ?
         AND user_id <> ?
         AND is_deleted = 0
       LIMIT 1`,
      [username, userId]
    );

    if (duplicates.length) {
      return res.status(409).json({
        message: "Username already exists."
      });
    }

    const [matricDuplicates] = await pool.query(
      `SELECT user_id
       FROM users
       WHERE matric_number = ?
         AND user_id <> ?
         AND is_deleted = 0
       LIMIT 1`,
      [matric, userId]
    );

    if (matricDuplicates.length) {
      return res.status(409).json({
        message: "Matric number cannot be same."
      });
    }

    if (password !== "") {
      if (
        password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password)
      ) {
        return res.status(400).json({
          message:
            "Password must have at least 8 characters, uppercase, lowercase and a number."
        });
      }

      await pool.query(
        `UPDATE users
         SET fullname = ?, username = ?, matric_number = ?,
             program = ?, password = ?
         WHERE user_id = ? AND is_deleted = 0`,
        [fullname, username, matric, program, password, userId]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET fullname = ?, username = ?, matric_number = ?, program = ?
         WHERE user_id = ? AND is_deleted = 0`,
        [fullname, username, matric, program, userId]
      );
    }

    res.json({
      message: "User updated successfully."
    });
  }));

  // DELETE USER
  router.delete("/users/:id", async (req, res) => {
    const userId = req.params.id;
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [users] = await connection.query(
        `SELECT user_id, fullname
         FROM users
         WHERE user_id = ?
         FOR UPDATE`,
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "User tidak dijumpai."
        });
      }

      await connection.query(
        "UPDATE borrow SET user_id = NULL WHERE user_id = ?",
        [userId]
      );

      await connection.query(
        "DELETE FROM users WHERE user_id = ?",
        [userId]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: "User berjaya dipadam secara kekal."
      });
    } catch (error) {
      if (connection) await connection.rollback();

      console.error("Permanent delete user error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal memadam user.",
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  });
  
  // ADMIN PROFILE & LIBRARIAN MANAGEMENT (table admins sahaja)
  const getCurrentAdminId = (req) => {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    return sessionAdminIds.get(token) || null;
  };

  router.get("/admins/me", requireAdmin, asyncRoute(async (req, res) => {
    const adminId = getCurrentAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Admin session was not found. Please log in again using the admin RFID card." });
    const [rows] = await pool.query("SELECT admin_id, username, password, uid, role, figure, created_at FROM admins WHERE admin_id = ? LIMIT 1", [adminId]);
    if (!rows.length) return res.status(404).json({ message: "Admin account not found." });
    res.set("Cache-Control", "no-store");
    res.json(rows[0]);
  }));

  router.get("/admins", requireAdmin, asyncRoute(async (_req, res) => {
    const [rows] = await pool.query("SELECT admin_id, username, uid, role, figure, created_at FROM admins ORDER BY admin_id");
    res.set("Cache-Control", "no-store");
    res.json(rows);
  }));

  router.put("/admins/me", requireAdmin, asyncRoute(async (req, res) => {
    const adminId = getCurrentAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Admin session was not found. Please log in again." });
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const figure = req.body?.figure == null ? "" : String(req.body.figure);
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    if (Buffer.byteLength(figure, "utf8") > 40 * 1024 * 1024) return res.status(413).json({ message: "Profile photo is too large. Maximum size is 30 MB." });
    const [dupes] = await pool.query("SELECT admin_id FROM admins WHERE username = ? AND admin_id <> ? LIMIT 1", [username, adminId]);
    if (dupes.length) return res.status(409).json({ message: "This username is already used by another admin." });
    await pool.query("UPDATE admins SET username = ?, password = ?, figure = ? WHERE admin_id = ?", [username, password, figure || null, adminId]);
    const [rows] = await pool.query("SELECT admin_id, username, password, uid, role, figure, created_at FROM admins WHERE admin_id = ?", [adminId]);
    res.json(rows[0]);
  }));

  router.post("/admins/scan-mode", requireAdmin, (req, res) => {
    state.adminScanMode = Boolean(req.body?.active);
    if (state.adminScanMode) {
      state.authMode = false;
      state.userMode = false;
      state.bookMode = false;
      state.authResult = null;
      state.pendingUser = null;
      state.pendingBook = null;
      state.adminScanResult = null;
    }
    res.json({ active: state.adminScanMode, mode: req.body?.mode || "" });
  });

  router.get("/admins/scan-result", requireAdmin, (_req, res) => {
    const result = state.adminScanResult;
    if (result?.status === "success" || result?.status === "error") state.adminScanResult = null;
    res.set("Cache-Control", "no-store");
    res.json(result || {});
  });

  router.post("/admins", requireAdmin, asyncRoute(async (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const uid = normalizeUID(req.body?.uid);
    const figure = req.body?.figure == null ? "" : String(req.body.figure);
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    if (!isUID(uid, 8)) return res.status(400).json({ message: "Scan a valid 8-character hexadecimal UID." });
    if (Buffer.byteLength(figure, "utf8") > 40 * 1024 * 1024) return res.status(413).json({ message: "Profile photo is too large. Maximum size is 30 MB." });
    const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM admins");
    if (Number(countRows[0]?.total || 0) >= 3) return res.status(409).json({ message: "The admins table can contain a maximum of 3 accounts." });
    const [dupes] = await pool.query("SELECT admin_id FROM admins WHERE username = ? OR uid = ? LIMIT 1", [username, uid]);
    if (dupes.length) return res.status(409).json({ message: "Username or RFID UID already exists." });
    await pool.query("INSERT INTO admins (username, password, uid, role, figure) VALUES (?, ?, ?, 'admin', ?)", [username, password, uid, figure || null]);
    res.status(201).json({ success: true, message: "Librarian added successfully." });
  }));

  router.post("/admins/replace-card", requireAdmin, asyncRoute(async (req, res) => {
    const adminId = getCurrentAdminId(req);
    if (!adminId) return res.status(401).json({ message: "Admin session was not found. Please log in again." });
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const uid = normalizeUID(req.body?.uid);
    const figure = req.body?.figure == null ? "" : String(req.body.figure);
    if (!username || !password || !isUID(uid, 8)) return res.status(400).json({ message: "Username, password and a valid scanned UID are required." });
    const [current] = await pool.query("SELECT admin_id FROM admins WHERE admin_id = ? AND username = ? AND password = ? LIMIT 1", [adminId, username, password]);
    if (!current.length) return res.status(403).json({ message: "Username and password do not match the currently signed-in admin. The old card was not changed." });
    const [dupes] = await pool.query("SELECT admin_id FROM admins WHERE uid = ? AND admin_id <> ? LIMIT 1", [uid, adminId]);
    if (dupes.length) return res.status(409).json({ message: "This RFID UID is already registered to another admin." });
    if (Buffer.byteLength(figure, "utf8") > 40 * 1024 * 1024) return res.status(413).json({ message: "Profile photo is too large. Maximum size is 30 MB." });
    await pool.query("UPDATE admins SET uid = ?, figure = ? WHERE admin_id = ?", [uid, figure || null, adminId]);
    res.json({ success: true, message: "Admin RFID card replaced successfully." });
  }));

  router.delete("/admins/:id", requireAdmin, asyncRoute(async (req, res) => {
    const adminId = Number(req.params.id);
    const currentId = getCurrentAdminId(req);
    const password = String(req.body?.password ?? "");
    if (!Number.isInteger(adminId) || adminId <= 0) return res.status(400).json({ message: "Invalid admin ID." });
    if (adminId === currentId) return res.status(400).json({ message: "You cannot remove the account currently signed in." });
    if (!password) return res.status(400).json({ message: "Enter the password for this admin account to confirm deletion." });
    const [rows] = await pool.query("SELECT admin_id, password FROM admins WHERE admin_id = ? LIMIT 1", [adminId]);
    if (!rows.length) return res.status(404).json({ message: "Admin not found." });
    if (String(rows[0].password ?? "") !== password) return res.status(403).json({ message: "Incorrect password. This admin account was not deleted." });
    await pool.query("DELETE FROM admins WHERE admin_id = ?", [adminId]);
    res.json({ success: true, message: "Librarian removed." });
  }));

  // GET ALL BOOKS
  router.get(
  "/books/scan-mode",
  requireAdmin,
  (_req, res) => {
    // Elakkan browser cache respons scan RFID
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store"
    });

    res.set("Cache-Control", "no-store");

    const result = state.pendingBook;

    // Ambil dan kosongkan UID yang telah diproses
    state.pendingBook = null;

    return res.status(200).json(
      result || {
        pendingUid: "",
        scanStatus: "idle"
      }
    );
  }
);

  // REGISTER USER USING SCANNED RFID CARD
  router.post(
    "/users/register-scanned",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const uid = normalizeUID(req.body?.uid);
      const fullname = String(
        req.body?.fullname ?? ""
      ).trim();
      const username = String(
        req.body?.username ?? ""
      ).trim();
      const matric = String(
        req.body?.matric_number ?? "-"
      ).trim() || "-";
      const password = String(
        req.body?.password ?? ""
      );

      const roleInput = String(
        req.body?.role ?? "Student"
      ).toLowerCase();

      const role =
        roleInput === "academic staff"
          ? "academic staff"
          : roleInput.includes("administr")
            ? "administration staff"
            : "student";

      const program = String(
        req.body?.program ?? "-"
      );

      if (!isUID(uid, 8)) {
        return res.status(400).json({
          message:
            "User UID must contain exactly 8 hexadecimal characters."
        });
      }

      if (!fullname || !username || !password) {
        return res.status(400).json({
          message:
            "Full name, username and password are required."
        });
      }

      const [dupes] = await pool.query(
        "SELECT user_id FROM users WHERE uid = ? OR username = ? LIMIT 1",
        [uid, username]
      );

      if (dupes.length) {
        return res.status(409).json({
          message: "UID or username already exists."
        });
      }

      if (matric && matric !== "-") {
        const [matricDupes] = await pool.query(
          `SELECT user_id
           FROM users
           WHERE matric_number = ?
             AND is_deleted = 0
           LIMIT 1`,
          [matric]
        );

        if (matricDupes.length) {
          return res.status(409).json({
            message: "Matric number cannot be same."
          });
        }
      }

      await pool.query(
        `INSERT INTO users
         (uid, fullname, username, matric_number, role,
          program, password, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          uid,
          fullname,
          username,
          matric,
          role,
          program,
          password
        ]
      );

      res.status(201).json({
        message: "User added successfully."
      });
    })
  );

  
  // GET ALL BOOKS FROM DATABASE
  router.get(
    "/books",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(
        "SELECT * FROM books ORDER BY title"
      );

      res.set("Cache-Control", "no-store");
      return res.status(200).json(rows);
    })
  );
  
  // ADD BOOK
  router.post(
    "/books",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const uid = normalizeUID(req.body?.uid);

      if (!isBookUID(uid)) {
        return res.status(400).json({
          message: "Book UID must contain 8 or 14 hexadecimal characters."
        });
      }

      const [duplicates] = await pool.query(
        "SELECT book_id FROM books WHERE uid = ? LIMIT 1",
        [uid]
      );

      if (duplicates.length) {
        return res.status(409).json({
          message: "This book UID already exists."
        });
      }

      const fields = [
        "title",
        "author",
        "call_number",
        "program",
        "status",
        "synopsis",
        "figure",
        "publisher",
        "published",
        "isbn",
        "edition",
        "page_count"
      ];

      const [columnRows] = await pool.query(
        "SHOW COLUMNS FROM books"
      );

      const allowed = new Set(
        columnRows.map((column) => column.Field)
      );

      const names = fields.filter(
        (field) =>
          allowed.has(field) &&
          req.body[field] !== undefined
      );

      const values = names.map(
        (field) => req.body[field] ?? ""
      );

      const insertNames = ["uid", ...names];
      const insertValues = [uid, ...values];

      await pool.query(
        `INSERT INTO books (${insertNames
          .map((field) => `\`${field}\``)
          .join(", ")})
         VALUES (${insertNames.map(() => "?").join(", ")})`,
        insertValues
      );

      res.status(201).json({
        message: "Book added successfully."
      });
    })
  );

  // EDIT BOOK
  // UID tidak diubah kerana UID mengenal pasti sticker RFID.
  router.put(
    "/books/:id",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const bookId = Number(req.params.id);

      if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({
          message: "Invalid book ID."
        });
      }

      const [existing] = await pool.query(
        "SELECT book_id FROM books WHERE book_id = ? LIMIT 1",
        [bookId]
      );

      if (!existing.length) {
        return res.status(404).json({
          message: "Book not found."
        });
      }

      const fields = [
        "title",
        "author",
        "call_number",
        "program",
        "status",
        "synopsis",
        "figure",
        "publisher",
        "published",
        "isbn",
        "edition",
        "page_count"
      ];

      const [columnRows] = await pool.query(
        "SHOW COLUMNS FROM books"
      );

      const allowed = new Set(
        columnRows.map((column) => column.Field)
      );

      const names = fields.filter(
        (field) =>
          allowed.has(field) &&
          req.body[field] !== undefined
      );

      if (!names.length) {
        return res.status(400).json({
          message: "No editable book fields were provided."
        });
      }

      const required = [
        "title",
        "author",
        "call_number",
        "publisher",
        "published",
        "synopsis"
      ];

      for (const field of required) {
        if (
          allowed.has(field) &&
          names.includes(field) &&
          !String(req.body[field] ?? "").trim()
        ) {
          return res.status(400).json({
            message: `${field} is required.`
          });
        }
      }

      const values = names.map(
        (field) => req.body[field] ?? null
      );

      await pool.query(
        `UPDATE books
         SET ${names
           .map((field) => `\`${field}\` = ?`)
           .join(", ")}
         WHERE book_id = ?`,
        [...values, bookId]
      );

      res.json({
        message: "Book updated successfully."
      });
    })
  );

  // DELETE BOOK SECARA KEKAL
  // Rekod pinjaman lama dikekalkan.
  router.delete(
    "/books/:id",
    requireAdmin,
    asyncRoute(async (req, res) => {
      const bookId = Number(req.params.id);

      if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({
          message: "Invalid book ID."
        });
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [books] = await connection.query(
          `SELECT book_id, title
           FROM books
           WHERE book_id = ?
           FOR UPDATE`,
          [bookId]
        );

        if (!books.length) {
          await connection.rollback();

          return res.status(404).json({
            message: "Book not found."
          });
        }

        // Putuskan hubungan rekod pinjaman dengan buku
        // sebelum memadam buku daripada jadual books.
        await connection.query(
          "UPDATE borrow SET book_id = NULL WHERE book_id = ?",
          [bookId]
        );

        await connection.query(
          "DELETE FROM books WHERE book_id = ?",
          [bookId]
        );

        await connection.commit();

        res.json({
          success: true,
          message:
            "Book permanently deleted. Borrowing history was retained."
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    })
  );

  // BATALKAN RFID SCAN BOOK
  router.post(
    "/books/scan-cancel",
    requireAdmin,
    (_req, res) => {
      state.pendingBook = null;

      res.json({
        success: true
      });
    }
  );

  // REKOD PINJAMAN DAN PEMULANGAN
  router.get(
    "/records",
    requireAdmin,
    asyncRoute(async (_req, res) => {
      const [rows] = await pool.query(`
        SELECT
          b.borrow_id,
          b.user_id,
          b.book_id,
          b.username,
          b.matric_number,
          b.program,
          b.book_title,
          b.author,
          b.book_publisher,
          b.book_published,
          b.book_isbn,
          b.book_call_number,
          b.book_edition,
          b.book_page_count,
          b.borrow_date,
          b.due_date,
          b.return_date,
          b.late_days,
          b.fine,
          b.payment_status,
          b.synopsis,
          b.figure,

          CASE
            WHEN b.user_id IS NULL
              OR u.user_id IS NULL
              OR u.is_deleted = 1
            THEN 1
            ELSE 0
          END AS deleted_user,

          CASE
            WHEN b.book_id IS NULL
              OR bk.book_id IS NULL
            THEN 1
            ELSE 0
          END AS deleted_book

        FROM borrow AS b

        LEFT JOIN users AS u
          ON b.user_id = u.user_id

        LEFT JOIN books AS bk
          ON b.book_id = bk.book_id

        ORDER BY b.borrow_date DESC, b.borrow_id DESC
      `);

      res.json(rows);
    })
  );

  // PENGENDALIAN ERROR
  router.use((err, _req, res, _next) => {
    console.error("Dashboard controller error:", err);

    res.status(500).json({
      message: "Dashboard request failed."
    });
  });

  return router;
}



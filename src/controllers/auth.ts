// src/controllers/auth.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET!;
type Role = "admin" | "nutritionist" | "client";

/** ---- Nutritionist allowlist (lowercased) ---- */
const ALLOWED_NUTRITIONIST_EMAILS = new Set(
  [
    "anushreenadiger97@gmail.com",
    "soundaryakv12@gmail.com",
    "rajimuthukrishnan1@gmail.com",
    "roshanrocky05@gmail.com",
    "0720sandhiya@gmail.com",
    "shafia.mmkzr@gmail.com",
    "vshoba04@gmail.com",
    "devakirenu2029@gmail.com",
    "savitha.s.kundapur@gmail.com",
    "swamymegha2002@gmail.com",
    "amalthankachan223@gmail.com",
    "dishamnaik111@gmail.com",
    "niharikas1101@gmail.com",
  ].map((e) => e.trim().toLowerCase())
);

const norm = (s: string) => (s || "").trim().toLowerCase();

function sign(user: { _id: any; role: Role; name: string; email: string }) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * POST /auth/login
 * Body:
 *  { email, password }                        -> existing user (any role)
 *  { email, password, mode:"client", ... }    -> if not found, create client user on first login
 * Optional (when creating a client):
 *  name?: string, client_id?: number, company_id?: number
 *
 * Additional rules here:
 *  - Only emails in ALLOWED_NUTRITIONIST_EMAILS may access as nutritionist.
 *  - If a nutritionist user doesn't exist yet but is allowlisted, first login creates it.
 *  - Admin behaves as before (must already exist).
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password, mode, name, client_id, company_id } = (req.body || {}) as {
      email?: string;
      password?: string;
      mode?: "client";
      name?: string;
      client_id?: number;
      company_id?: number;
    };

    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const e = norm(email);

    // Find existing user (admin | nutritionist | client)
    const existing = await User.findOne({ email: e }).lean();

    if (existing) {
      // Staff safety: if the account is nutritionist but email isn't allowlisted → block
      if (existing.role === "nutritionist" && !ALLOWED_NUTRITIONIST_EMAILS.has(e)) {
        return res.status(403).json({ error: "This email is not authorized for staff access." });
      }

      const ok = await bcrypt.compare(password, existing.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = sign({
        _id: existing._id,
        role: existing.role as Role,
        name: existing.name,
        email: existing.email,
      });

      return res.json({
        token,
        user: { id: String(existing._id), name: existing.name, role: existing.role, email: existing.email },
      });
    }

    // Not found → either client-first-login OR allowlisted nutritionist bootstrap
    if (mode === "client") {
      const password_hash = await bcrypt.hash(password, 10);
      const created = await User.create({
        name: name || e.split("@")[0],
        email: e,
        role: "client" as Role,
        password_hash,
        client_id: Number.isFinite(Number(client_id)) ? Number(client_id) : undefined,
        company_id: Number.isFinite(Number(company_id)) ? Number(company_id) : undefined,
      });

      const token = sign({ _id: created._id, role: created.role, name: created.name, email: created.email });
      return res.status(201).json({
        token,
        user: { id: String(created._id), name: created.name, role: created.role, email: created.email },
      });
    }

    // Staff first-login:
    // - Admins are not auto-created here (keep your existing admin seeding/registration).
    // - Nutritionists: only create if email is in the allowlist.
    if (ALLOWED_NUTRITIONIST_EMAILS.has(e)) {
      const password_hash = await bcrypt.hash(password, 10);
      const created = await User.create({
        name: name || e.split("@")[0],
        email: e,
        role: "nutritionist" as Role,
        password_hash,
      });

      const token = sign({ _id: created._id, role: created.role, name: created.name, email: created.email });
      return res.status(201).json({
        token,
        user: { id: String(created._id), name: created.name, role: created.role, email: created.email },
      });
    }

    // Anyone else (not client mode and not allowlisted) → blocked
    return res.status(403).json({ error: "This email is not authorized to access the dashboard." });
  } catch (e: any) {
    return res.status(500).json({ error: "Login failed", detail: e?.message });
  }
}

/** Optional: keep for manual bootstrap, but guard nutritionists by the allowlist */
export async function register(req: Request, res: Response) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: "name, email, password, role required" });

    if (!["admin", "nutritionist"].includes(role))
      return res.status(400).json({ error: "role must be admin | nutritionist" });

    const e = norm(email);

    // Only allow nutritionist register if in allowlist (admin always allowed)
    if (role === "nutritionist" && !ALLOWED_NUTRITIONIST_EMAILS.has(e)) {
      return res.status(403).json({ error: "Email is not permitted to register as staff." });
    }

    const exists = await User.findOne({ email: e });
    if (exists) return res.status(409).json({ error: "email already exists" });

    const password_hash = await bcrypt.hash(password, 10);
    const u = await User.create({ name, email: e, role, password_hash });

    const token = sign({ _id: u._id, role: u.role as Role, name: u.name, email: u.email });

    return res.status(201).json({
      token,
      user: { id: String(u._id), name: u.name, role: u.role, email: u.email },
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Register failed", detail: e?.message });
  }
}

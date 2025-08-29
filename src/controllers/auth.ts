import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET!;

type Role = "admin" | "nutritionist" | "client";

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

    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const existing = await User.findOne({ email }).lean();

    if (existing) {
      // normal login: validate password
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

    // First-time login path — only allowed when mode="client"
    if (mode !== "client") {
      return res.status(404).json({ error: "User not found" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const created = await User.create({
      name: name || email.split("@")[0],
      email,
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
  } catch (e: any) {
    return res.status(500).json({ error: "Login failed", detail: e?.message });
  }
}

/** (unchanged, still for admin/nutritionist bootstrap) */
export async function register(req: Request, res: Response) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: "name, email, password, role required" });
    if (!["admin", "nutritionist"].includes(role))
      return res.status(400).json({ error: "role must be admin | nutritionist" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "email already exists" });

    const password_hash = await bcrypt.hash(password, 10);
    const u = await User.create({ name, email, role, password_hash });

    const token = sign({ _id: u._id, role: u.role as Role, name: u.name, email: u.email });

    return res.status(201).json({ 
      token,
      user: { id: String(u._id), name: u.name, role: u.role, email: u.email },
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Register failed", detail: e?.message });
  }
}

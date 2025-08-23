import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET!;

function sign(user: { _id: any; role: "admin" | "nutritionist"; name: string; email: string }) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = sign({
      _id: user._id,
      role: user.role as any,
      name: user.name,
      email: user.email,
    });

    return res.json({
      token,
      user: { id: String(user._id), name: user.name, role: user.role, email: user.email },
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Login failed", detail: e?.message });
  }
}

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

    const token = sign({ _id: u._id, role: u.role, name: u.name, email: u.email });

    return res.status(201).json({
      token,
      user: { id: String(u._id), name: u.name, role: u.role, email: u.email },
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Register failed", detail: e?.message });
  }
}

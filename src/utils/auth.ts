import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!JWT_SECRET) return res.status(500).json({ error: "Server misconfigured" });

  const raw = (req.headers["authorization"] as string | undefined) ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const token = match ? match[1].trim() : raw.trim();

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (!role) return res.status(401).json({ error: "Unauthorized" });
    if (!allowed.includes(role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

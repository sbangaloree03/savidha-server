import { Request, Response } from "express";
import mongoose from "mongoose";

const Alerts = mongoose.connection.collection("alerts");

export async function listAlerts(req: Request, res: Response) {
  const user = (req as any).user as { name: string };
  const sinceISO = (req.query.since as string) || null;
  const match: any = { for_user: user.name };
  if (sinceISO) match.created_at = { $gte: new Date(sinceISO) };

  const alerts = await Alerts
    .find(match, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  res.json({ alerts });
}

export async function markAlertsRead(req: Request, res: Response) {
  const user = (req as any).user as { name: string };
  await Alerts.updateMany(
    { for_user: user.name, read_at: null },
    { $set: { read_at: new Date() } }
  );
  res.json({ ok: true });
}

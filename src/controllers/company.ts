import { Request, Response } from "express";
import Client from "../models/Client";
import Followup from "../models/Followup";

export async function listCompanyClients(req: Request, res: Response) {
  const companyId = Number(req.params.companyId);
  const { status, q, from, to, nutritionist } = req.query as any;

  const matchClient: any = { company_id: companyId };
  if (q) matchClient.$or = [
    { name: new RegExp(q, "i") },
    { client_id: Number(q) || -1 }
  ];
  if (nutritionist) matchClient.assigned_nutritionist = nutritionist;

  const clients = await Client.find(matchClient).sort({ name: 1 }).limit(500).lean();

  const ids = clients.map(c => c.client_id);
  const matchFU: any = { client_id: { $in: ids } };
  if (status === "overdue") {
    matchFU.status = "pending";
    matchFU.scheduled_at = { $lt: new Date(Date.now() - 48*60*60*1000) };
  } else if (["pending","done","reached_out"].includes(status)) {
    matchFU.status = status;
  }
  if (from || to) {
    matchFU.scheduled_at = matchFU.scheduled_at || {};
    if (from) matchFU.scheduled_at.$gte = new Date(`${from}T00:00:00Z`);
    if (to)   matchFU.scheduled_at.$lte = new Date(`${to}T23:59:59Z`);
  }

  const fu = await Followup.find(matchFU).lean();

  // attach followups to clients
  const byClient: Record<number, any[]> = {};
  fu.forEach(f => {
    byClient[f.client_id] = byClient[f.client_id] || [];
    byClient[f.client_id].push(f);
  });

  const result = clients.map(c => ({ ...c, followups: byClient[c.client_id] || [] }));
  res.json(result);
}

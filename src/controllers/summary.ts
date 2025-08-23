// src/controllers/summary.ts
import { Request, Response } from "express";
import mongoose from "mongoose";

const Companies = mongoose.connection.collection("companies");
const Clients   = mongoose.connection.collection("clients");
const Followups = mongoose.connection.collection("followups");

/**
 * Summary rules (with filters)
 * - Per (company, client) consider the EARLIEST followup (min scheduled_at/followup_date).
 * - Count that single status per client.
 * - Filters supported via query:
 *    - status = done|pending|reached_out|overdue|all (default all)
 *    - from, to = ISO dates (applied to earliest followup date)
 *    - nutritionist (admin only; nutritionists are automatically scoped to self)
 * - Admin sees all (or filtered); Nutritionist is auto-filtered to assigned_nutritionist=self.
 */
export async function getSummary(req: Request, res: Response) {
  const user = (req as any).user as { role: "admin" | "nutritionist"; name: string };

  const { status, from, to, nutritionist } = req.query as Record<string, string>;

  const now = new Date();
  const fortyEightHrsAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // 1) Base company list (id + name)
  const companies = await Companies
    .find({}, { projection: { _id: 0, company_id: 1, name: 1 } })
    .toArray();

  // 2) Build base match for followups by role and optional admin nutritionist filter
  const followupsMatch: any = {};
  if (user?.role === "nutritionist") {
    followupsMatch.assigned_nutritionist = user.name;
  } else if (nutritionist?.trim()) {
    followupsMatch.assigned_nutritionist = nutritionist.trim();
  }

  // 3) Compute earliest followup per (company_id, client_id) with sched + normalized status
  const pipeline: any[] = [
    { $match: followupsMatch },
    {
      $addFields: {
        sched: { $ifNull: ["$scheduled_at", "$followup_date"] },
        norm_status: { $ifNull: ["$status", "pending"] },
      },
    },
    { $sort: { sched: 1 } }, // earliest first
    {
      $group: {
        _id: { company_id: "$company_id", client_id: "$client_id" },
        company_id: { $first: "$company_id" },
        client_id:  { $first: "$client_id" },
        status:     { $first: "$norm_status" },
        sched:      { $first: "$sched" },
      },
    },
  ];

  // Date filter (applies to earliest sched)
  if (from || to) {
    pipeline.push({
      $match: {
        ...(from ? { sched: { $gte: new Date(from) } } : {}),
        ...(to   ? { ...(from ? {} : { sched: {} }), sched: { ...(from ? { $gte: new Date(from) } : {}), $lte: new Date(to + "T23:59:59.999Z") } } : {}),
      },
    });
  }

  // Status filter (including overdue)
  const wantStatus = (status || "all").toLowerCase();
  if (wantStatus !== "all") {
    if (wantStatus === "overdue") {
      pipeline.push({
        $match: {
          status: "pending",
          sched: { $lt: fortyEightHrsAgo },
        },
      });
    } else {
      pipeline.push({ $match: { status: wantStatus } });
    }
  }

  const perClientEarliest = await Followups.aggregate(pipeline).toArray();

  // 4) Roll up those per-client statuses by company
  type ByCompany = {
    done: number; pending: number; reached_out: number; overdue: number;
    clients: Set<number>;
  };
  const byCompany = new Map<number, ByCompany>();
  for (const row of perClientEarliest) {
    const cid = row.company_id as number;
    const bc = byCompany.get(cid) ?? { done:0, pending:0, reached_out:0, overdue:0, clients:new Set<number>() };

    if (row.status === "done") bc.done += 1;
    else if (row.status === "reached_out") bc.reached_out += 1;
    else bc.pending += 1;

    if (row.status === "pending" && row.sched && row.sched < fortyEightHrsAgo) bc.overdue += 1;

    bc.clients.add(row.client_id as number);
    byCompany.set(cid, bc);
  }

  // 5) Company-level client counts:
  //    - Admin: true total clients in that company (unfiltered)
  //    - Nutritionist: only distinct clients among their (filtered) earliest set
  let clientsCountByCompany = new Map<number, number>();
  if (user?.role === "admin") {
    const clientsAgg = await Clients.aggregate([
      { $group: { _id: "$company_id", total_clients: { $sum: 1 } } },
    ]).toArray();
    clientsCountByCompany = new Map(clientsAgg.map(x => [x._id as number, x.total_clients as number]));
  } else {
    for (const [cid, bc] of byCompany) {
      clientsCountByCompany.set(cid, bc.clients.size);
    }
  }

  // 6) Build company cards (nutritionist sees only companies they touch, after filters)
  const cards = companies
    .filter(c => (user?.role === "admin" ? true : byCompany.has(c.company_id)))
    .map(c => {
      const bc = byCompany.get(c.company_id) ?? { done:0, pending:0, reached_out:0, overdue:0, clients:new Set<number>() };
      const total_clients = clientsCountByCompany.get(c.company_id) ?? 0;
      const denom = bc.done + bc.pending;
      const completion_pct = denom > 0 ? Math.round((bc.done / denom) * 100) : 0;

      return {
        company_id: c.company_id,
        name: c.name,
        total_clients,
        done: bc.done,
        pending: bc.pending,
        reached_out: bc.reached_out,
        overdue: bc.overdue,
        completion_pct,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // 7) Totals for stat cards — derive from `cards` so UI and totals always match
const totals_total_clients = cards.reduce((s, x) => s + (x.total_clients || 0), 0);
const totals_done          = cards.reduce((s, x) => s + (x.done || 0), 0);
const totals_pending       = cards.reduce((s, x) => s + (x.pending || 0), 0);
const totals_overdue       = cards.reduce((s, x) => s + (x.overdue || 0), 0);
const totals_completion    = (totals_done + totals_pending) > 0
  ? (totals_done / (totals_done + totals_pending)) * 100
  : 0;

res.json({
  companies: cards,
  totals: {
    total_clients: totals_total_clients,
    done: totals_done,
    pending: totals_pending,
    overdue: totals_overdue,
    completion: totals_completion,
  },
});
}

// src/controllers/calendar.ts
import { Request, Response } from "express";
import mongoose from "mongoose";

const Followups = mongoose.connection.collection("followups");
const Clients   = mongoose.connection.collection("clients");
const Companies = mongoose.connection.collection("companies");

// /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD[&nutritionist=...]
export async function getCalendar(req: Request, res: Response) {
  const user = (req as any).user as { role: "admin" | "nutritionist"; name: string };
  const { start, end, nutritionist } = req.query as Record<string, string>;

  if (!start || !end) {
    return res.status(400).json({ error: "start and end are required (YYYY-MM-DD)" });
  }

  const startDate = new Date(start + "T00:00:00.000Z");
  const endDate   = new Date(end   + "T23:59:59.999Z");
  const now = new Date();
  const fortyEightHrsAgo = new Date(now.getTime() - 48 * 3600 * 1000);

  const match: any = {
    $expr: {
      $and: [
        { $gte: [ { $ifNull: ["$scheduled_at", "$followup_date"] }, startDate ] },
        { $lte: [ { $ifNull: ["$scheduled_at", "$followup_date"] }, endDate   ] },
      ],
    },
  };

  if (user?.role === "nutritionist") {
    match.assigned_nutritionist = user.name;
  } else if (nutritionist?.trim()) {
    match.assigned_nutritionist = nutritionist.trim();
  }

  const events = await Followups.aggregate([
    { $match: match },
    {
      $addFields: {
        sched: { $ifNull: ["$scheduled_at", "$followup_date"] },
        status: { $ifNull: ["$status", "pending"] },
      },
    },
    // Enrich names
    {
      $lookup: {
        from: "clients",
        let: { cid: "$client_id", comp: "$company_id" },
        pipeline: [
          { $match: { $expr: { $and: [ { $eq: ["$client_id", "$$cid"] }, { $eq: ["$company_id", "$$comp"] } ] } } },
          { $project: { _id: 0, name: 1, contact_info: 1 } },
        ],
        as: "clientDoc"
      }
    },
    {
      $lookup: {
        from: "companies",
        localField: "company_id",
        foreignField: "company_id",
        as: "companyDoc"
      }
    },
    {
      $project: {
        _id: 1,
        company_id: 1,
        client_id: 1,
        assigned_nutritionist: 1,
        status: 1,
        sched: 1,
        date: {
          $dateToString: { format: "%Y-%m-%d", date: "$sched" }
        },
        client_name: { $ifNull: [ { $arrayElemAt: ["$clientDoc.name", 0] }, "" ] },
        company_name: { $ifNull: [ { $arrayElemAt: ["$companyDoc.name", 0] }, "" ] },
      }
    },
    { $sort: { sched: 1 } }
  ]).toArray();

  // Add derived "overdue" here so client doesn't need server time
  const out = events.map(e => ({
    id: e._id,
    date: e.date as string,
    status: e.status as "done" | "pending" | "reached_out",
    overdue: (e.status === "pending" && e.sched && e.sched < fortyEightHrsAgo),
    client_id: e.client_id,
    client_name: e.client_name,
    company_id: e.company_id,
    company_name: e.company_name,
    assigned_nutritionist: e.assigned_nutritionist,
  }));

  res.json({ events: out });
}

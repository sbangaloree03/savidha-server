// src/controllers/followups.ts
import { Request, Response } from "express";
import Followup from "../models/Followup";

type FollowupStatus = "pending" | "done" | "reached_out";

function toDateOrUndefined(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function createFollowup(req: Request, res: Response) {
  try {
    // 1) Make sure we really have JSON
    if (!req.is("application/json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    // 2) Read body safely
    const body = req.body ?? {};
    const {
      company_id,
      client_id,
      scheduled_at,
      followup_date, // optional legacy name
      status = "pending",
      notes = "",
      assigned_nutritionist,
      requirements,
      present_readings,
      next_target,
      given_plan,
    } = body as {
      company_id: number | string;
      client_id: number | string;
      scheduled_at?: string;
      followup_date?: string;
      status?: FollowupStatus;
      notes?: string;
      assigned_nutritionist?: string;
      requirements?: string;
      present_readings?: string;
      next_target?: string;
      given_plan?: string;
    };

    // 3) Basic validation with clear 400s
    if (company_id === undefined || client_id === undefined) {
      return res.status(400).json({ error: "company_id and client_id are required" });
    }
    const cId = Number(company_id);
    const clId = Number(client_id);
    if (Number.isNaN(cId) || Number.isNaN(clId)) {
      return res.status(400).json({ error: "company_id and client_id must be numbers" });
    }
    if (status && !["pending", "done", "reached_out"].includes(status)) {
      return res.status(400).json({ error: "status must be pending | done | reached_out" });
    }

    // 4) Normalize dates
    const sched = toDateOrUndefined(scheduled_at);
    const legacy = toDateOrUndefined(followup_date);

    // 5) Create the document
    const doc = await Followup.create({
      company_id: cId,
      client_id: clId,
      scheduled_at: sched,
      followup_date: !sched ? legacy : undefined,
      status,
      notes,
      assigned_nutritionist,
      requirements,
      present_readings,
      next_target,
      given_plan,
    });

    return res.status(201).json(doc);
  } catch (err: any) {
    console.error("createFollowup error:", err); // ← see full error in your terminal
    return res.status(500).json({
      error: "Failed to create follow-up",
      detail: err?.message ?? String(err),
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
    });
  }
}

export async function updateFollowupStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: FollowupStatus };

    if (!status || !["pending", "done", "reached_out"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const patch: any = { status, completed_at: status === "done" ? new Date() : null };
    const updated = await Followup.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!updated) return res.status(404).json({ error: "Follow-up not found" });
    return res.json(updated);
  } catch (err: any) {
    console.error("updateFollowupStatus error:", err);
    return res.status(500).json({ error: "Failed to update follow-up status", detail: err?.message });
  }
}

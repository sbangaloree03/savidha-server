// src/controllers/followups.ts
import { Request, Response } from "express";
import Followup, { FollowupStatus } from "../models/Followup";

function toDateOrUndefined(v: any): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function createFollowup(req: Request, res: Response) {
  try {
    if (!req.is("application/json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    // Allow passing ids via URL or body (URL wins)
    const companyIdParam = (req.params as any).companyId;
    const clientIdParam  = (req.params as any).clientId;

    const body = req.body ?? {};
    const {
      company_id: bodyCompany,
      client_id:  bodyClient,

      // dates
      scheduled_at,
      followup_date,

      // status + meta
      status = "pending",
      notes = "",
      assigned_nutritionist,
      requirements,
      present_readings,
      next_target,
      given_plan,

      // NEW structured vitals
      weight_kg,
      bmi,
      bp,
      sugar,
    }: {
      company_id?: number | string;
      client_id?: number | string;
      scheduled_at?: string;
      followup_date?: string;
      status?: FollowupStatus;
      notes?: string;
      assigned_nutritionist?: string;
      requirements?: string;
      present_readings?: string;
      next_target?: string;
      given_plan?: string;
      weight_kg?: number | string;
      bmi?: number | string;
      bp?: string;
      sugar?: string;
    } = body;

    const cId = Number(companyIdParam ?? bodyCompany);
    const clId = Number(clientIdParam ?? bodyClient);
    if (Number.isNaN(cId) || Number.isNaN(clId)) {
      return res.status(400).json({ error: "company_id and client_id are required numbers" });
    }
    if (status && !["pending", "done", "reached_out"].includes(status)) {
      return res.status(400).json({ error: "status must be pending | done | reached_out" });
    }

    const sched  = toDateOrUndefined(scheduled_at);
    const legacy = toDateOrUndefined(followup_date);

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

      // cast numeric strings -> numbers
      weight_kg: weight_kg === "" || weight_kg === undefined ? undefined : Number(weight_kg),
      bmi:       bmi === "" || bmi === undefined ? undefined : Number(bmi),
      bp,
      sugar,
    });

    return res.status(201).json({ ok: true, followup: doc });
  } catch (err: any) {
    console.error("createFollowup error:", err);
    return res.status(500).json({
      error: "Failed to create follow-up",
      detail: err?.message ?? String(err),
    });
  }
}

export async function updateFollowupStatus(req: Request, res: Response) {
  try {
    const id = (req.params as any).id || (req.params as any).followupId;
    const { status } = req.body as { status: FollowupStatus };

    if (!id) return res.status(400).json({ error: "followup id is required" });
    if (!status || !["pending", "done", "reached_out"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const patch: any = {
      status,
      completed_at: status === "done" ? new Date() : null,
      updated_at: new Date(),
    };

    const updated = await Followup.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!updated) return res.status(404).json({ error: "Follow-up not found" });

    return res.json({ ok: true, followup: updated });
  } catch (err: any) {
    console.error("updateFollowupStatus error:", err);
    return res.status(500).json({
      error: "Failed to update follow-up status",
      detail: err?.message,
    });
  }
}

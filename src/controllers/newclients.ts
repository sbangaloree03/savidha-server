// src/controllers/newclients.ts
import { Request, Response } from "express";
import mongoose from "mongoose";

const Companies  = mongoose.connection.collection("companies");
const Clients    = mongoose.connection.collection("clients");
const Followups  = mongoose.connection.collection("followups");
const NewClients = mongoose.connection.collection("newclients");

// helper
function toDateOrUndef(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Body shape we accept (keep it flexible for your form):
 * {
 *   company_id?: number
 *   company_name?: string
 *   client_id?: number
 *   emp_id?: number
 *   name: string
 *   contact_info?: string
 *   age?: number
 *   medical_history?: string
 *   current_condition?: string
 *   assigned_nutritionist?: string
 *   first_followup_at?: string | Date
 *   status?: "pending"|"done"|"reached_out"
 *   notes?: string
 * }
 */
export async function createNewClient(req: Request, res: Response) {
  try {
    if ((req.headers["content-type"] || "").includes("application/json") === false) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    const {
      company_id,
      company_name,
      client_id,
      emp_id,
      name,
      contact_info,
      age,
      medical_history,
      current_condition,
      assigned_nutritionist,
      first_followup_at,
      status,
      notes,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // 1) resolve company_id (prefer explicit id; else lookup by name)
    let cid: number | undefined = company_id;
    if (!cid && company_name) {
      const cmp = await Companies.findOne({ name: company_name }, { projection: { company_id: 1 } });
      if (!cmp) return res.status(400).json({ error: `Unknown company: ${company_name}` });
      cid = cmp.company_id as number;
    }
    if (!cid) return res.status(400).json({ error: "company_id or company_name is required" });

    // 2) choose client_id (use given, else generate next)
    let newClientId: number = client_id;
    if (!newClientId) {
      const last = await Clients.find({}).sort({ client_id: -1 }).limit(1).toArray();
      const maxExisting = last?.[0]?.client_id ?? 0;
      newClientId = maxExisting + 1;
    }

    // 3) Persist raw form to the new collection
    const formDoc = {
      company_id: cid,
      company_name: company_name || undefined,
      client_id: newClientId,
      emp_id: emp_id || undefined,
      name,
      contact_info: contact_info || undefined,
      age: age ?? undefined,
      medical_history: medical_history || undefined,
      current_condition: current_condition || undefined,
      assigned_nutritionist: assigned_nutritionist || undefined,
      first_followup_at: toDateOrUndef(first_followup_at),
      status: status || "pending",
      notes: notes || undefined,
      created_at: new Date(),
      created_by: (req as any).user?.name || "system",
    };
    await NewClients.insertOne(formDoc);

    // 4) Upsert into "clients" (so it shows up in company page)
    await Clients.updateOne(
      { client_id: newClientId },
      {
        $set: {
          company_id: cid,
          client_id: newClientId,
          name,
          contact_info: contact_info || "",
          age: age ?? null,
          medical_history: medical_history || "",
          current_condition: current_condition || "",
          emp_id: emp_id ?? null,
        },
      },
      { upsert: true }
    );

    // 5) Create the first follow-up (so Dashboard/Summary picks it up)
    await Followups.insertOne({
      company_id: cid,
      client_id: newClientId,
      assigned_nutritionist: assigned_nutritionist || null,
      status: status || "pending",
      scheduled_at: toDateOrUndef(first_followup_at) || new Date(), // default: now
      given_plan: notes || "",
      created_at: new Date(),
    });

    return res.json({
      ok: true,
      company_id: cid,
      client_id: newClientId,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Failed to create client" });
  }
}

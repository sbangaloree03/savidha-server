// server/src/controllers/newclients.ts
import { Request, Response } from "express";
import mongoose from "mongoose";

const Companies  = mongoose.connection.collection("companies");
const Clients    = mongoose.connection.collection("clients");
const Followups  = mongoose.connection.collection("followups");
const NewClients = mongoose.connection.collection("newclients");

// ---------- helpers ----------
function toDateOrUndef(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}
function toNumOrUndef(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Expected body (flexible):
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
 *   status?: "pending" | "done" | "reached_out"
 *   requirements?: string
 *   present_readings?: string
 *   next_target?: string
 *   given_plan?: string
 *   // NEW: optional file for given plan
 *   given_plan_file?: { name: string; type?: string; size?: number; base64: string }
 *   notes?: string
 * }
 */
export async function createNewClient(req: Request, res: Response) {
  try {
    // require JSON (your client is posting JSON)
    if ((req.headers["content-type"] || "").includes("application/json") === false) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    const body = req.body || {};
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
      // extras
      requirements,
      present_readings,
      next_target,
      given_plan,
      given_plan_file,
      notes,
    } = body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // 1) resolve company
    let cid: number | undefined = toNumOrUndef(company_id);
    if (!cid && company_name) {
      const cmp = await Companies.findOne(
        { name: company_name },
        { projection: { company_id: 1 } }
      );
      if (!cmp) return res.status(400).json({ error: `Unknown company: ${company_name}` });
      cid = cmp.company_id as number;
    }
    if (!cid) return res.status(400).json({ error: "company_id or company_name is required" });

    // 2) choose client_id (use provided or generate next)
    let newClientId: number = toNumOrUndef(client_id) as number;
    if (!newClientId) {
      const last = await Clients.find({})
        .sort({ client_id: -1 })
        .limit(1)
        .toArray();
      const maxExisting = last?.[0]?.client_id ?? 0;
      newClientId = maxExisting + 1;
    }

    // 3) sanitize optional plan file
    let planFileDoc: any = null;
    if (given_plan_file && typeof given_plan_file === "object") {
      const f = given_plan_file as {
        name?: string;
        type?: string;
        size?: number;
        base64?: string;
      };

      if (typeof f.name === "string" && typeof f.base64 === "string") {
        // If client didn't send size, estimate from base64 length.
        const estimatedBytes =
          typeof f.size === "number" && Number.isFinite(f.size)
            ? Number(f.size)
            : Math.floor((f.base64.length * 3) / 4); // rough

        if (estimatedBytes > MAX_FILE_BYTES) {
          return res
            .status(400)
            .json({ error: `File too large. Max ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB.` });
        }

        planFileDoc = {
          name: String(f.name).slice(0, 200),
          type: typeof f.type === "string" ? f.type : "application/octet-stream",
          size: estimatedBytes,
          base64: f.base64, // store only the data portion
          uploaded_at: new Date(),
        };
      }
    }

    // 4) persist intake record in "newclients"
    const formDoc = {
      company_id: cid,
      company_name: company_name || undefined,
      client_id: newClientId,
      emp_id: toNumOrUndef(emp_id),
      name,
      contact_info: contact_info || undefined,
      age: toNumOrUndef(age),
      medical_history: medical_history || undefined,
      current_condition: current_condition || undefined,
      assigned_nutritionist: assigned_nutritionist || undefined,
      first_followup_at: toDateOrUndef(first_followup_at),
      status: (status as any) || "pending",
      // extras
      requirements: requirements || undefined,
      present_readings: present_readings || undefined,
      next_target: next_target || undefined,
      given_plan: given_plan || undefined,
      given_plan_file: planFileDoc, // ← NEW field
      notes: notes || undefined,

      created_at: new Date(),
      updated_at: new Date(),
      created_by: (req as any).user?.name || "system",
    };

    await NewClients.insertOne(formDoc);

    // 5) upsert minimal profile in "clients" (so it appears in listings)
    await Clients.updateOne(
      { client_id: newClientId },
      {
        $set: {
          company_id: cid,
          client_id: newClientId,
          name,
          contact_info: contact_info || "",
          age: toNumOrUndef(age) ?? null,
          medical_history: medical_history || "",
          current_condition: current_condition || "",
          assigned_nutritionist: assigned_nutritionist || "",
          emp_id: toNumOrUndef(emp_id) ?? null,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true }
    );

    // 6) create the initial follow-up (Dashboard/Summary relies on it)
    await Followups.insertOne({
      company_id: cid,
      client_id: newClientId,
      assigned_nutritionist: assigned_nutritionist || null,
      status: (status as any) || "pending",
      scheduled_at: toDateOrUndef(first_followup_at) || new Date(), // default: now
      // keep text plan in followups (file remains in newclients doc)
      given_plan: given_plan || "",
      notes: notes || "",
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
// --- below your existing imports/consts & createNewClient() ---

/** Update an intake row (admin + nutritionist) */
export async function updateNewClient(req: Request, res: Response) {
  const id = Number(req.params.clientId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad clientId" });

  // limit which fields are editable through this route
  const editable: Array<
    | "name" | "contact_info" | "age"
    | "medical_history" | "current_condition"
    | "assigned_nutritionist" | "first_followup_at"
    | "status" | "requirements" | "present_readings"
    | "next_target" | "given_plan" | "notes"
  > = [
    "name","contact_info","age","medical_history","current_condition",
    "assigned_nutritionist","first_followup_at","status",
    "requirements","present_readings","next_target","given_plan","notes",
  ];

  const $set: Record<string, any> = { updated_at: new Date() };

  for (const k of editable) {
    if (req.body[k] !== undefined) {
      if (k === "age") $set[k] = toNumOrUndef(req.body[k]);
      else if (k === "first_followup_at") $set[k] = toDateOrUndef(req.body[k]);
      else $set[k] = req.body[k];
    }
  }

  const updated = await NewClients.findOneAndUpdate(
    { client_id: id },
    { $set },
    { returnDocument: "after" } as any
  );
  if (!updated?.value) return res.status(404).json({ error: "Intake client not found" });

  // keep core fields in master clients in sync (light touch)
  const sync: Record<string, any> = {};
  if ($set.name !== undefined) sync.name = $set.name;
  if ($set.contact_info !== undefined) sync.contact_info = $set.contact_info;
  if ($set.age !== undefined) sync.age = $set.age;
  if ($set.medical_history !== undefined) sync.medical_history = $set.medical_history;
  if ($set.current_condition !== undefined) sync.current_condition = $set.current_condition;
  if ($set.assigned_nutritionist !== undefined) sync.assigned_nutritionist = $set.assigned_nutritionist;
  if (Object.keys(sync).length) {
    await Clients.updateOne({ client_id: id }, { $set: sync });
  }

  return res.json({ ok: true, client: updated.value });
}

/** Delete an intake row (admin only) */
export async function deleteNewClient(req: Request, res: Response) {
  const id = Number(req.params.clientId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad clientId" });

  const doc = await NewClients.findOne({ client_id: id });
  if (!doc) return res.status(404).json({ error: "Intake client not found" });

  await NewClients.deleteOne({ client_id: id });
  // Do NOT delete from master clients/followups here (intake record removal only).
  return res.json({ ok: true, deleted_client_id: id });
}

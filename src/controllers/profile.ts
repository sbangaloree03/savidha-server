import { Request, Response } from "express";
import mongoose from "mongoose";

const Companies  = mongoose.connection.collection("companies");
const Clients    = mongoose.connection.collection("clients");
const Followups  = mongoose.connection.collection("followups");
const NewClients = mongoose.connection.collection("newclients");

// helper — normalize followup date & status
function normFU(f: any) {
  const sched = f?.scheduled_at ?? f?.followup_date ?? null;
  return {
    _id: String(f?._id || ""),
    status: f?.status ?? "pending",
    assigned_nutritionist: f?.assigned_nutritionist ?? null,
    requirements: f?.requirements ?? null,
    present_readings: f?.present_readings ?? null,
    next_target: f?.next_target ?? null,
    given_plan: f?.given_plan ?? null,
    scheduled_at: sched,
    created_at: f?.created_at ?? null,
  };
}

export async function getClientProfile(req: Request, res: Response) {
  try {
    const company_id = Number(req.params.companyId);
    const client_id  = Number(req.params.clientId);
    if (!Number.isFinite(company_id) || !Number.isFinite(client_id)) {
      return res.status(400).json({ error: "Invalid ids" });
    }

    const [company, client, newForm] = await Promise.all([
      Companies.findOne({ company_id }, { projection: { _id:0, company_id:1, name:1 } }),
      Clients.findOne({ company_id, client_id }, { projection: { _id:0 } }),
      NewClients.findOne({ company_id, client_id }, { projection: { _id:0 } }),
    ]);

    if (!client) return res.status(404).json({ error: "Client not found" });

    const followups = await Followups
      .find({ company_id, client_id })
      .sort({ scheduled_at: -1, followup_date: -1, created_at: -1 })
      .toArray();

    const fus = followups.map(normFU);

    // quick rollups
    const counts = fus.reduce((acc, f) => {
      acc[f.status] = (acc[f.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // next scheduled (soonest future) & last done
    const now = new Date();
    const upcoming = [...fus]
      .filter(f => f.scheduled_at && new Date(f.scheduled_at) >= now)
      .sort((a,b) => +new Date(a.scheduled_at as any) - +new Date(b.scheduled_at as any))[0] || null;

    const lastDone = [...fus]
      .filter(f => f.status === "done" && f.scheduled_at)
      .sort((a,b) => +new Date(b.scheduled_at as any) - +new Date(a.scheduled_at as any))[0] || null;

    res.json({
      company,
      client,
      newForm,       // raw “Add Client” payload if it exists
      followups: fus, // full timeline
      counts,
      upcoming,
      lastDone,
    });
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Failed to load profile" });
  }
}
export async function updateClientIntake(req: Request, res: Response) {
  try {
    const company_id = Number(req.params.companyId);
    const client_id  = Number(req.params.clientId);
    if (!Number.isFinite(company_id) || !Number.isFinite(client_id)) {
      return res.status(400).json({ error: "Invalid ids" });
    }

    // allowed fields coming from the Profile edit form
    const {
      contact_info,
      age,
      medical_history,
      current_condition,
      assigned_nutritionist,
      first_followup_at,   // optional; if provided we keep it in newclients
      status,              // optional intake status
      notes,
    } = req.body || {};

    // Build $set for newclients (intake)
    const set: any = {
      ...(contact_info !== undefined ? { contact_info } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(medical_history !== undefined ? { medical_history } : {}),
      ...(current_condition !== undefined ? { current_condition } : {}),
      ...(assigned_nutritionist !== undefined ? { assigned_nutritionist } : {}),
      ...(first_followup_at ? { first_followup_at: new Date(first_followup_at) } : {}),
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
      updated_at: new Date(),
      updated_by: (req as any).user?.name || "system",
    };

    const NewClients = mongoose.connection.collection("newclients");
    const Clients    = mongoose.connection.collection("clients");

    // Upsert intake
    await NewClients.updateOne(
      { company_id, client_id },
      {
        $set: set,
        $setOnInsert: {
          company_id, client_id,
          created_at: new Date(),
          created_by: (req as any).user?.name || "system",
        }
      },
      { upsert: true }
    );

    // Mirror key basics to clients so list/profile basics reflect immediately
    const mirror: any = {
      ...(contact_info !== undefined ? { contact_info } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(medical_history !== undefined ? { medical_history } : {}),
      ...(current_condition !== undefined ? { current_condition } : {}),
      ...(assigned_nutritionist !== undefined ? { assigned_nutritionist } : {}),
    };
    if (Object.keys(mirror).length) {
      await Clients.updateOne({ company_id, client_id }, { $set: mirror });
    }

    // Return the fresh profile
    const { getClientProfile } = await import("./profile");
    return getClientProfile(req, res);
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Failed to save intake" });
  }
}
export async function getClientHome(req: Request, res: Response) {
  try {
    const user = (req as any).user as { sub: string; role: string; name: string; email: string };
    if (user?.role !== "client") return res.status(403).json({ error: "Forbidden" });

    const Users = mongoose.connection.collection("users");
    const me = await Users.findOne({ _id: new mongoose.Types.ObjectId(user.sub) });

    let client = null;
    if (me?.client_id) {
      client = await Clients.findOne(
        { client_id: me.client_id },
        { projection: { _id: 0 } }
      );
    }

    return res.json({
      user: { name: me?.name, email: me?.email, client_id: me?.client_id, company_id: me?.company_id },
      client,
    });
  } catch (e:any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Failed to load client home" });
  }
}

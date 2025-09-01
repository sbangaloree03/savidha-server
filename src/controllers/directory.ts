// src/controllers/directory.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";

const Clients     = mongoose.connection.collection("clients");
const NewClients  = mongoose.connection.collection("newclients");
const FormDataCol = mongoose.connection.collection("formdata");
const Users       = mongoose.connection.collection("users");
const Followups   = mongoose.connection.collection("followups");

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeNameCore(s: string) {
  return s.toLowerCase().replace(/^(ms|mrs|mr|dr)\.?\s+/i, "").replace(/\s+/g, " ").trim();
}
async function findUserByParam(Users: any, userIdParam: string) {
  // numeric user_id
  if (/^\d+$/.test(userIdParam)) {
    return Users.findOne({ user_id: Number(userIdParam) });
  }
  // Mongo ObjectId
  try {
    const oid = new ObjectId(userIdParam);
    return Users.findOne({ _id: oid });
  } catch {
    return null;
  }
}

export async function getClientDirectory(req: Request, res: Response) {
  try {
    const user = (req as any).user as { role: "admin" | "nutritionist"; name: string };
    const isNutri = user?.role === "nutritionist";

    // ---- Build allowed pairs from FOLLOWUPS (source of truth for assignment) ----
    let allowedPairs = new Set<string>(); // "companyId|clientId"
    let allowedCompanyIds = new Set<number>();

    let nutriRx: RegExp | null = null;
    if (isNutri) {
      const core = normalizeNameCore(user?.name || "");
      nutriRx = core ? new RegExp(`^\\s*(?:ms\\.?|mrs\\.?|mr\\.?|dr\\.?)?\\s*${escapeRegex(core)}\\s*$`, "i") : null;

      if (nutriRx) {
        const agg = await Followups.aggregate([
          { $match: { assigned_nutritionist: { $regex: nutriRx } } },
          { $group: { _id: { company_id: "$company_id", client_id: "$client_id" } } },
        ]).toArray();

        for (const r of agg) {
          const company_id = Number(r._id.company_id);
          const client_id  = Number(r._id.client_id);
          if (Number.isFinite(company_id) && Number.isFinite(client_id)) {
            allowedPairs.add(`${company_id}|${client_id}`);
            allowedCompanyIds.add(company_id);
          }
        }
      }
    }

    // ---------- A) master clients ----------
    const clientsMatch: any[] = [];
    if (isNutri && nutriRx) {
      // match either by followups-allowed pairs OR by own assigned_nutritionist (fallback)
      clientsMatch.push({
        $match: {
          $or: [
            { assigned_nutritionist: { $regex: nutriRx } },
            ...(allowedPairs.size
              ? [{
                  $expr: {
                    $in: [
                      { $concat: [{ $toString: "$company_id" }, "|", { $toString: "$client_id" }] },
                      Array.from(allowedPairs),
                    ],
                  },
                }]
              : []),
          ],
        },
      });
    }
    const a = Clients.aggregate([
      ...clientsMatch,
      {
        $project: {
          _id: 0,
          source: { $literal: "clients" },
          client_id: "$client_id",
          company_id: "$company_id",
          name: "$name",
          contact: "$contact_info",
          age: "$age",
          medical_history: "$medical_history",
          current_condition: "$current_condition",
          assigned_nutritionist: "$assigned_nutritionist",
          score: null,
          risk: null,
          last_submission: null,
        },
      },
    ]);

    // ---------- B) intake (newclients) ----------
    const newMatch: any[] = [];
    if (isNutri && nutriRx) {
      newMatch.push({
        $match: {
          $or: [
            { assigned_nutritionist: { $regex: nutriRx } },
            ...(allowedPairs.size
              ? [{ client_id: { $in: Array.from(allowedPairs).map(s => Number(s.split("|")[1])) } }]
              : []),
          ],
        },
      });
    }
    const b = NewClients.aggregate([
      ...newMatch,
      {
        $project: {
          _id: 0,
          source: { $literal: "newclients" },
          client_id: "$client_id",
          company_id: "$company_id",
          name: "$name",
          contact: "$contact_info",
          age: "$age",
          medical_history: "$medical_history",
          current_condition: "$current_condition",
          assigned_nutritionist: "$assigned_nutritionist",
          score: null,
          risk: "$status",
          last_submission: null,
        },
      },
    ]);

    // ---------- C) latest form submission per user (+ join users) ----------
    const cPipeline: any[] = [
      { $sort: { createdAt: -1, created_at: -1 } },
      { $group: { _id: "$userId", doc: { $first: "$$ROOT" } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
    ];
    if (isNutri) {
      if (allowedCompanyIds.size === 0) {
        const [A, B] = await Promise.all([a.toArray(), b.toArray()]);
        return res.json({ ok: true, items: [...A, ...B] }); // none from formdata
      }
      cPipeline.push({
        $match: { "user.company_id": { $in: Array.from(allowedCompanyIds.values()) } },
      });
    }
    cPipeline.push({
  $project: {
    _id: 0,
    source: { $literal: "formdata" },
    // ✅ use numeric user_id if present; else fall back to stringified _id
    client_id: { $ifNull: ["$user.user_id", { $toString: "$user._id" }] },
    company_id: "$user.company_id",
    name: "$user.name",
    contact: "$user.email",
    age: null,
    medical_history: null,
    current_condition: null,
    assigned_nutritionist: null,
    score: "$doc.computed.total_score",
    risk: "$doc.computed.risk_category",
    last_submission: { $ifNull: ["$doc.createdAt", "$doc.created_at"] },
  },
});
    const c = FormDataCol.aggregate(cPipeline);

    const [A, B, C] = await Promise.all([a.toArray(), b.toArray(), c.toArray()]);
    res.json({ ok: true, items: [...A, ...B, ...C] });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Failed to build directory" });
  }
}
export async function getFormProfileByUserId(req: Request, res: Response) {
  try {
    const Users       = mongoose.connection.collection("users");
    const FormDataCol = mongoose.connection.collection("formdata");
    const Companies   = mongoose.connection.collection("companies");

    const user = await findUserByParam(Users, req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const latest = await FormDataCol.find({ userId: user._id as ObjectId })
      .sort({ createdAt: -1, created_at: -1 })
      .limit(1)
      .toArray();
    const form = latest[0] || null;

    const company = user.company_id
      ? await Companies.findOne(
          { company_id: user.company_id },
          { projection: { _id: 0, company_id: 1, name: 1 } }
        )
      : null;

    return res.json({ ok: true, user, company, form });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Failed to load form profile" });
  }
}

// UPDATE a "Form" user (name/email/company)
// Allowed for admin + nutritionist
export async function updateFormUser(req: Request, res: Response) {
  try {
    const Users = mongoose.connection.collection("users");

    const user = await findUserByParam(Users, req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const allowed = ["name", "email", "company_id"] as const;
    const $set: Record<string, any> = {};
    for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];
    if (!Object.keys($set).length) return res.status(400).json({ error: "No updatable fields provided" });

    const updated = await Users.findOneAndUpdate(
      { _id: user._id },
      { $set },
      { returnDocument: "after" } as any
    );

    return res.json({ ok: true, user: updated.value });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Failed to update form user" });
  }
}


// DELETE a "Form" user + their form submissions
// Allowed for admin only
export async function deleteFormUser(req: Request, res: Response) {
  try {
    const Users = mongoose.connection.collection("users");
    const FormDataCol = mongoose.connection.collection("formdata");

    const user = await findUserByParam(Users, req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    await FormDataCol.deleteMany({ userId: user._id });
    await Users.deleteOne({ _id: user._id });

    return res.json({ ok: true, deleted_user_id: String(req.params.userId) });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Failed to delete form user" });
  }
}


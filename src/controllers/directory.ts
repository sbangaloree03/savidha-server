import { Request, Response } from "express";
import mongoose from "mongoose";

const Clients     = mongoose.connection.collection("clients");
const NewClients  = mongoose.connection.collection("newclients");
const FormDataCol = mongoose.connection.collection("formdata");
const Users       = mongoose.connection.collection("users");

export async function getClientDirectory(req: Request, res: Response) {
  try {
    // A) master clients
    const a = Clients.aggregate([
      { $project: {
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
          last_submission: null
      } }
    ]);

    // B) intake (newclients)
    const b = NewClients.aggregate([
      { $project: {
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
          risk: "$status",            // pending|done etc
          last_submission: null
      } }
    ]);

    // C) latest form submission per user + join users
    const c = FormDataCol.aggregate([
      { $sort: { createdAt: -1, created_at: -1 } },
      { $group: { _id: "$userId", doc: { $first: "$$ROOT" } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $project: {
          _id: 0,
          source: { $literal: "formdata" },
          client_id: "$user.user_id",
          company_id: "$user.company_id",
          name: "$user.name",
          contact: "$user.email",
          age: null,
          medical_history: null,
          current_condition: null,
          assigned_nutritionist: null,
          score: "$doc.computed.total_score",
          risk: "$doc.computed.risk_category",
          last_submission: { $ifNull: ["$doc.createdAt", "$doc.created_at"] }
      } }
    ]);

    const [A, B, C] = await Promise.all([a.toArray(), b.toArray(), c.toArray()]);
    res.json({ ok: true, items: [...A, ...B, ...C] });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Failed to build directory" });
  }
}

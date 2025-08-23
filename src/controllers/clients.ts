import { Request, Response } from "express";
import mongoose from "mongoose";

const Clients = mongoose.connection.collection("clients");
const Companies = mongoose.connection.collection("companies");
const Followups = mongoose.connection.collection("followups");

// -----------------------------------------------------------------------------
// LIST company clients
// -----------------------------------------------------------------------------
export async function listCompanyClients(req: Request, res: Response) {
  const companyId = Number(req.params.companyId);
  const { status, q, from, to } = req.query as Record<string, string>;
  const user = (req as any).user as { role: "admin" | "nutritionist"; name: string };

  const matchFollow: any = { company_id: companyId };

  // Nutritionists see only their assigned clients
  if (user?.role === "nutritionist") {
    matchFollow.assigned_nutritionist = user.name;
  }

  // normalize status; support 'overdue'
  if (status && status !== "overdue") matchFollow.status = status;

  // date filter
  if (from || to) {
    matchFollow.$expr = {
      $and: [
        {
          $gte: [
            { $ifNull: ["$scheduled_at", "$followup_date"] },
            from ? new Date(from) : new Date(0),
          ],
        },
        {
          $lte: [
            { $ifNull: ["$scheduled_at", "$followup_date"] },
            to ? new Date(to + "T23:59:59.999Z") : new Date(8640000000000000),
          ],
        },
      ],
    };
  }

  // overdue pipeline
  const fortyEightHrsAgo = new Date(Date.now() - 48 * 3600 * 1000);
  const overduePipeline =
    status === "overdue"
      ? [
          { $addFields: { sched: { $ifNull: ["$scheduled_at", "$followup_date"] } } },
          { $match: { status: "pending", sched: { $lt: fortyEightHrsAgo } } },
        ]
      : [];

  // clients for this company
  const matchClient: any = { company_id: companyId };
  if (q) {
    const rx = new RegExp(q, "i");
    matchClient.$or = [
      { name: rx },
      { contact_info: rx },
      { client_id: Number.isFinite(+q) ? +q : -999999 },
    ];
  }

  const clients = await Clients.aggregate([
    { $match: matchClient },
    {
      $lookup: {
        from: "followups",
        let: { cid: "$client_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$company_id", companyId] },
                  { $eq: ["$client_id", "$$cid"] },
                ],
              },
            },
          },
          { $match: matchFollow },
          ...overduePipeline,
          { $sort: { scheduled_at: 1, followup_date: 1 } },
        ],
        as: "followups",
      },
    },
  ]).toArray();

  // include the company name
  const company = await Companies.findOne(
    { company_id: companyId },
    { projection: { _id: 0, company_id: 1, name: 1 } }
  );

  res.json({ company, clients });
}

// -----------------------------------------------------------------------------
// UPDATE client (admin only)
// -----------------------------------------------------------------------------
export async function updateClient(req: Request, res: Response) {
  const clientId = Number(req.params.clientId);

  const allowed = [
    "name",
    "contact_info",
    "age",
    "medical_history",
    "current_condition",
    "assigned_nutritionist",
    "requirements",
    "present_readings",
    "next_target",
    "given_plan",
    "notes",
  ] as const;

  const $set: Record<string, any> = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) $set[k] = req.body[k];
  }

  if (Object.keys($set).length === 0) {
    return res.status(400).json({ error: "No updatable fields provided" });
  }

  const updated = await Clients.findOneAndUpdate(
    { client_id: clientId },
    { $set },
    { returnDocument: "after" } as any
  );

  if (!updated) return res.status(404).json({ error: "Client not found" });

  res.json({ ok: true, client: updated });
}

// -----------------------------------------------------------------------------
// DELETE client (admin only)
// -----------------------------------------------------------------------------
export async function deleteClient(req: Request, res: Response) {
  const clientId = Number(req.params.clientId);

  const client = await Clients.findOne({ client_id: clientId });
  if (!client) return res.status(404).json({ error: "Client not found" });

  await Clients.deleteOne({ client_id: clientId });
  await Followups.deleteMany({ client_id: clientId });

  res.json({ ok: true, deleted_client_id: clientId });
}

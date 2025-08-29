import { Request, Response } from "express";
import mongoose from "mongoose";
import FormData from "../models/FormData";

type Sleep = "<4" | "4-5" | "6-7" | "8+";
type Activity = "0" | "1-2" | "3-4" | "5+";
type Stress = "Always/Often" | "Sometimes" | "Rarely/Never";
type BmiBucket = "under" | "normal" | "over" | "obese" | null;
type RiskCat = "Low Risk" | "Moderate Risk" | "High Risk";

const P = {
  sleep: { "<4": 3, "4-5": 2, "6-7": 1, "8+": 0 } as Record<Sleep, number>,
  activity: { "0": 3, "1-2": 2, "3-4": 1, "5+": 0 } as Record<Activity, number>,
  stress: { "Always/Often": 3, Sometimes: 2, "Rarely/Never": 0 } as Record<Stress, number>,
  bmi: { under: 1, normal: 0, over: 1, obese: 3 },
  hba1c: { normal: 0, pre: 2, diabetes: 3 },
};

function calcBMI(height_cm: number | null, weight_kg: number | null): number | null {
  if (!height_cm || !weight_kg) return null;
  const h = height_cm / 100;
  if (h <= 0) return null;
  const bmi = weight_kg / (h * h);
  return isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}
function bucketBMI(bmi: number | null): BmiBucket {
  if (bmi == null) return null;
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  return "obese";
}
function bucketA1c(a1c: number | null): "normal" | "pre" | "diabetes" {
  if (a1c == null) return "normal";
  if (a1c < 5.7) return "normal";
  if (a1c < 6.5) return "pre";
  return "diabetes";
}
function riskFromTotal(total: number): { category: RiskCat; action: string } {
  if (total <= 5) return { category: "Low Risk", action: "Maintain healthy lifestyle." };
  if (total <= 10) return { category: "Moderate Risk", action: "Consider lifestyle improvements; consult if needed." };
  return { category: "High Risk", action: "Strongly recommend medical consultation and intervention." };
}
function buildRemarks({
  pSleep,
  pActivity,
  pStress,
  bmiBucket,
  pHba1c,
}: {
  pSleep: number;
  pActivity: number;
  pStress: number;
  bmiBucket: BmiBucket;
  pHba1c: number;
}): string {
  const notes: string[] = [];
  if (pSleep >= 2) notes.push("Sleep pattern suboptimal.");
  if (pActivity >= 2) notes.push("Low physical activity.");
  if (pStress >= 2) notes.push("High perceived stress.");
  if (bmiBucket === "under") notes.push("BMI underweight.");
  if (bmiBucket === "over") notes.push("BMI overweight.");
  if (bmiBucket === "obese") notes.push("BMI obese.");
  if (pHba1c >= 2) notes.push("HbA1c elevated.");
  return notes.length ? notes.join(" ") : "Within healthy ranges on all tracked items.";
}

/**
 * POST /api/formdata
 * Body can be:
 * {
 *   answers: { sleep, activity, stress, height_cm?, weight_kg?, hba1c_pct? }
 * }
 * Everything else (BMI, points, total, risk, suggested_action, remarks) is computed server-side.
 */
export async function createFormData(req: Request, res: Response) {
  try {
    const user = (req as any).user as { sub: string; role: string; name: string; email: string };
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    // Accept answers nested under answers OR at root for convenience
    const src = (req.body?.answers ?? req.body) || {};
    const sleep: Sleep = src.sleep;
    const activity: Activity = src.activity;
    const stress: Stress = src.stress;
    const height_cm = src.height_cm != null ? Number(src.height_cm) : null;
    const weight_kg = src.weight_kg != null ? Number(src.weight_kg) : null;
    const hba1c_pct = src.hba1c_pct != null ? Number(src.hba1c_pct) : null;

    // basic validation
    const valid =
      ["<4", "4-5", "6-7", "8+"].includes(sleep) &&
      ["0", "1-2", "3-4", "5+"].includes(activity) &&
      ["Always/Often", "Sometimes", "Rarely/Never"].includes(stress);
    if (!valid) return res.status(400).json({ error: "Invalid answers" });

    // compute
    const bmi = calcBMI(height_cm, weight_kg);
    const bmi_bucket = bucketBMI(bmi);
    const pSleep = P.sleep[sleep];
    const pActivity = P.activity[activity];
    const pStress = P.stress[stress];
    const pBmi =
      bmi_bucket == null
        ? 0
        : bmi_bucket === "under"
        ? P.bmi.under
        : bmi_bucket === "normal"
        ? P.bmi.normal
        : bmi_bucket === "over"
        ? P.bmi.over
        : P.bmi.obese;

    const a1cBucket = bucketA1c(hba1c_pct);
    const pHba1c = P.hba1c[a1cBucket];
    const total = pSleep + pActivity + pStress + pBmi + pHba1c;
    const { category, action } = riskFromTotal(total);
    const remarks = buildRemarks({ pSleep, pActivity, pStress, bmiBucket: bmi_bucket, pHba1c });

    const doc = await FormData.create({
      userId: new mongoose.Types.ObjectId(user.sub),
      answers: { sleep, activity, stress, height_cm, weight_kg, hba1c_pct },
      computed: {
        bmi,
        bmi_bucket,
        points: { sleep: pSleep, activity: pActivity, stress: pStress, bmi: pBmi, hba1c: pHba1c },
        total_score: total,
        risk_category: category,
        suggested_action: action,
        remarks,
      },
    });

    return res.status(201).json({ ok: true, doc });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to save form data", detail: e?.message });
  }
}

/** GET /api/formdata/mine/latest  -> latest document for logged-in user */
export async function getMyLatestFormData(req: Request, res: Response) {
  try {
    const user = (req as any).user as { sub: string };
    if (!user?.sub) return res.status(401).json({ error: "Unauthorized" });

    const doc = await FormData.findOne({ userId: new mongoose.Types.ObjectId(user.sub) })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    return res.json({ doc });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load latest form data", detail: e?.message });
  }
}

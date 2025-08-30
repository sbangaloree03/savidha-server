import { Request, Response } from "express";
import FormData from "../models/FormData";

// ---- helper scoring (same rubric) ----
const points = {
  sleep: { "<4": 3, "4-5": 2, "6-7": 1, "8+": 0 } as Record<string, number>,
  activity: { "0": 3, "1-2": 2, "3-4": 1, "5+": 0 } as Record<string, number>,
  stress: { "Always/Often": 3, Sometimes: 2, "Rarely/Never": 0 } as Record<string, number>,
  bmi: { under: 1, normal: 0, over: 1, obese: 3 },
  hba1c: { normal: 0, pre: 2, diabetes: 3 },
};

function calcBMI(height_cm?: number | null, weight_kg?: number | null) {
  if (!height_cm || !weight_kg) return null;
  const h = height_cm / 100;
  if (h <= 0) return null;
  const bmi = weight_kg / (h * h);
  return isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}
function bucketBMI(bmi: number | null) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "under";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "over";
  return "obese";
}
function bucketA1c(a1c?: number | null) {
  if (a1c == null) return "normal";
  if (a1c < 5.7) return "normal";
  if (a1c < 6.5) return "pre";
  return "diabetes";
}
function riskFromTotal(total: number) {
  if (total <= 5) return { category: "Low Risk", action: "Maintain healthy lifestyle." };
  if (total <= 10) return { category: "Moderate Risk", action: "Consider lifestyle improvements; consult if needed." };
  return { category: "High Risk", action: "Strongly recommend medical consultation and intervention." };
}
function remarksFrom(parts: { pSleep: number; pActivity: number; pStress: number; bmiBucket: any; pHba1c: number; }) {
  const notes: string[] = [];
  if (parts.pSleep >= 2) notes.push("Sleep pattern suboptimal.");
  if (parts.pActivity >= 2) notes.push("Low physical activity.");
  if (parts.pStress >= 2) notes.push("High perceived stress.");
  if (parts.bmiBucket === "under") notes.push("BMI underweight.");
  if (parts.bmiBucket === "over") notes.push("BMI overweight.");
  if (parts.bmiBucket === "obese") notes.push("BMI obese.");
  if (parts.pHba1c >= 2) notes.push("HbA1c elevated.");
  return notes.length ? notes.join(" ") : "Within healthy ranges on all tracked items.";
}

// POST /api/formdata
export async function createFormData(req: Request, res: Response) {
  try {
    // if you have auth middleware, it should set req.user.id
    const userId = (req as any)?.user?.id || (req.body.userId as string);
    if (!userId) return res.status(400).json({ error: "userId missing" });

    const a = (req.body?.answers ?? {}) as {
      sleep?: string; activity?: string; stress?: string;
      height_cm?: number | null; weight_kg?: number | null; hba1c_pct?: number | null;
    };

    const bmi = calcBMI(a.height_cm ?? null, a.weight_kg ?? null);
    const bmiBucket = bucketBMI(bmi);
    const pSleep = points.sleep[a.sleep ?? "6-7"] ?? 0;
    const pActivity = points.activity[a.activity ?? "3-4"] ?? 0;
    const pStress = points.stress[a.stress ?? "Sometimes"] ?? 0;
    const pBmi =
      bmiBucket == null ? 0
        : bmiBucket === "under" ? points.bmi.under
        : bmiBucket === "normal" ? points.bmi.normal
        : bmiBucket === "over" ? points.bmi.over
        : points.bmi.obese;
    const a1cBucket = bucketA1c(a.hba1c_pct ?? null);
    const pHba1c = points.hba1c[a1cBucket];

    const total = pSleep + pActivity + pStress + pBmi + pHba1c;
    const { category, action } = riskFromTotal(total);
    const remarks = remarksFrom({ pSleep, pActivity, pStress, bmiBucket, pHba1c });

    const doc = await FormData.create({
      userId,
      answers: a,
      computed: {
        bmi,
        bmi_bucket: bmiBucket,
        points: { sleep: pSleep, activity: pActivity, stress: pStress, bmi: pBmi, hba1c: pHba1c },
        total_score: total,
        risk_category: category,
        suggested_action: action,
        remarks,
      },
    });

    return res.json({ ok: true, doc });
  } catch (e: any) {
    console.error("createFormData error:", e);
    return res.status(500).json({ error: e?.message || "failed" });
  }
}

// GET /api/formdata/mine/latest
export async function getMyLatest(req: Request, res: Response) {
  try {
    const userId = (req as any)?.user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ error: "userId missing" });
    const doc = await FormData.findOne({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ doc });
  } catch (e: any) {
    console.error("getMyLatest error:", e);
    return res.status(500).json({ error: e?.message || "failed" });
  }
}

// Simple ping
export async function health(req: Request, res: Response) {
  return res.json({ ok: true });
}

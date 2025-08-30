import mongoose, { Schema, Types } from "mongoose";

export type FormDataDoc = {
  userId: Types.ObjectId;
  answers: {
    sleep?: string;
    activity?: string;
    stress?: string;
    height_cm?: number | null;
    weight_kg?: number | null;
    hba1c_pct?: number | null;
  };
  computed?: {
    bmi?: number | null;
    bmi_bucket?: "under" | "normal" | "over" | "obese" | null;
    points?: { sleep?: number; activity?: number; stress?: number; bmi?: number; hba1c?: number };
    total_score?: number;
    risk_category?: "Low Risk" | "Moderate Risk" | "High Risk";
    suggested_action?: string;
    remarks?: string;
  };
};

const FormDataSchema = new Schema<FormDataDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    computed: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true } // <-- creates createdAt / updatedAt
);

export default mongoose.models.FormData ||
  mongoose.model<FormDataDoc>("FormData", FormDataSchema, "formdata"); // uses savidha.formdata

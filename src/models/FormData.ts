import mongoose, { Schema, Document } from "mongoose";

export interface IFormData extends Document {
  userId: mongoose.Types.ObjectId;

  answers: {
    sleep: "<4" | "4-5" | "6-7" | "8+";
    activity: "0" | "1-2" | "3-4" | "5+";
    stress: "Always/Often" | "Sometimes" | "Rarely/Never";
    height_cm: number | null;
    weight_kg: number | null;
    hba1c_pct: number | null;
  };

  computed: {
    bmi: number | null;
    bmi_bucket: "under" | "normal" | "over" | "obese" | null;
    points: {
      sleep: number;
      activity: number;
      stress: number;
      bmi: number;
      hba1c: number;
    };
    total_score: number;
    risk_category: "Low Risk" | "Moderate Risk" | "High Risk";
    suggested_action: string;
    remarks: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const FormDataSchema = new Schema<IFormData>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },

    answers: {
      sleep: { type: String, enum: ["<4", "4-5", "6-7", "8+"], required: true },
      activity: { type: String, enum: ["0", "1-2", "3-4", "5+"], required: true },
      stress: {
        type: String,
        enum: ["Always/Often", "Sometimes", "Rarely/Never"],
        required: true,
      },
      height_cm: { type: Number, default: null },
      weight_kg: { type: Number, default: null },
      hba1c_pct: { type: Number, default: null },
    },

    computed: {
      bmi: { type: Number, default: null },
      bmi_bucket: { type: String, enum: ["under", "normal", "over", "obese", null], default: null },
      points: {
        sleep: { type: Number, required: true },
        activity: { type: Number, required: true },
        stress: { type: Number, required: true },
        bmi: { type: Number, required: true },
        hba1c: { type: Number, required: true },
      },
      total_score: { type: Number, required: true },
      risk_category: { type: String, enum: ["Low Risk", "Moderate Risk", "High Risk"], required: true },
      suggested_action: { type: String, required: true },
      remarks: { type: String, required: true },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IFormData>("FormData", FormDataSchema, "formdata");

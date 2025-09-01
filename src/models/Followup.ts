import mongoose, { Schema, Document, Model } from "mongoose";

export type FollowupStatus = "pending" | "done" | "reached_out";

export interface IFollowup extends Document {
  company_id: number;
  client_id: number;

  scheduled_at?: Date;     // next follow-up date (preferred)
  followup_date?: Date;    // legacy

  status: FollowupStatus;
  completed_at?: Date | null;
  notes: string;

  assigned_nutritionist?: string;
  requirements?: string;
  present_readings?: string; // old free-text bucket (kept for compatibility)
  next_target?: string;
  given_plan?: string;

  // NEW structured vitals
  weight_kg?: number;
  bmi?: number;
  bp?: string;             // e.g. "120/80"
  sugar?: string;          // e.g. "FBS 110", "GRBS 140"
}

const FollowupSchema = new Schema<IFollowup>(
  {
    company_id: { type: Number, required: true, index: true },
    client_id:  { type: Number, required: true, index: true },

    scheduled_at:  { type: Date },
    followup_date: { type: Date }, // legacy

    status: {
      type: String,
      enum: ["pending", "done", "reached_out"],
      default: "pending",
      index: true,
    },
    completed_at: { type: Date, default: null },
    notes:        { type: String, default: "" },

    assigned_nutritionist: { type: String },
    requirements:          { type: String },
    present_readings:      { type: String },
    next_target:           { type: String },
    given_plan:            { type: String },

    // NEW structured vitals
    weight_kg: { type: Number },
    bmi:       { type: Number },
    bp:        { type: String },
    sugar:     { type: String },
  },
  { timestamps: true, versionKey: false }
);

FollowupSchema.index({ company_id: 1, client_id: 1, status: 1, scheduled_at: 1 });

const Followup: Model<IFollowup> =
  mongoose.models.Followup || mongoose.model<IFollowup>("Followup", FollowupSchema);

export default Followup;

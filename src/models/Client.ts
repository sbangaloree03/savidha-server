import { Schema, model, Types } from "mongoose";

const ClientSchema = new Schema({
  company_id: { type: Number, required: true },        // maps to Company.id
  client_id: { type: Number, required: true },         // employee ID
  name: { type: String, required: true },
  age: Number,
  contact_info: String,
  medical_history: String,
  current_condition: String,
  requirements: String,
  present_readings: String,
  target: String,
  given_plan: String,
  assigned_nutritionist: String, // name; simple for now
}, { timestamps: true });

ClientSchema.index({ company_id: 1 });
ClientSchema.index({ client_id: 1 }, { unique: false });

export default model("Client", ClientSchema);

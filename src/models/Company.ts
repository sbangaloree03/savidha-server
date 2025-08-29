import { Schema, model } from "mongoose";

const CompanySchema = new Schema({
  id: { type: Number, required: true, unique: true }, // 1..8
  name: { type: String, required: true, unique: true }
}, { timestamps: true });

export default model("Company", CompanySchema);

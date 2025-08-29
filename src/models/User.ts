import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  role: "admin" | "nutritionist" | "client";
  password_hash: string;
  client_id?: number;
  company_id?: number;
  createdAt: Date;
  updatedAt: Date;
}


const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["admin", "nutritionist", "client"], required: true }, // ← add client
    password_hash: { type: String, required: true },
    client_id: { type: Number, required: false },   // NEW
    company_id: { type: Number, required: false },  // NEW
  },
  { timestamps: true }
);


export default mongoose.model<IUser>("User", UserSchema, "users");

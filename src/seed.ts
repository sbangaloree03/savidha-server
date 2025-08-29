// src/seed.ts
import bcrypt from "bcrypt";
import User from "./models/User";

export const seedAdmin = async () => {
  const hashedPassword = await bcrypt.hash("Admin@123", 10);

  await User.create({
    user_id: 100,
    name: "Admin",
    email: "admin@savidha.local",
    password: hashedPassword,
    role: "Admin"
  });

  console.log("✅ Admin user seeded!");
};

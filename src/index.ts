import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import router from "./routes";  // ⬅ no .js

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api", router);

async function start() {
  await mongoose.connect(process.env.MONGO_URI as string, { dbName: "savidha" });
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}
start();

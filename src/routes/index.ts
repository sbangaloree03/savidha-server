import { Router } from "express";
import {  requireRole } from "../utils/auth";
import { getSummary } from "../controllers/summary";
import { listCompanyClients, updateClient, deleteClient } from "../controllers/clients";
import { createFollowup, updateFollowupStatus } from "../controllers/followups";
import { login, register } from "../controllers/auth";
import { getCalendar } from "../controllers/calendar";
import { createNewClient } from "../controllers/newclients";
import { requireAuth } from "../utils/auth";

const r = Router();

// auth
r.post("/auth/login", login);
r.post("/auth/register", register);

// secured
r.get("/summary", requireAuth, getSummary);
r.get("/companies/:companyId/clients", requireAuth, listCompanyClients);
r.post("/followups", requireAuth, createFollowup);
r.patch("/followups/:id/status", requireAuth, updateFollowupStatus);

// client CRUD (admin only)
r.put("/clients/:clientId", requireAuth, requireRole("admin"), updateClient);
r.delete("/clients/:clientId", requireAuth, requireRole("admin"), deleteClient);

// calendar
r.get("/calendar", requireAuth, getCalendar);
r.post("/newclients", requireAuth, createNewClient);
export default r;

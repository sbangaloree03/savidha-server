// src/routes/index.ts
import { Router } from "express";
import { requireAuth, requireRole } from "../utils/auth";

import { login, register } from "../controllers/auth";
import { getSummary } from "../controllers/summary";
import { listCompanyClients, updateClient, deleteClient } from "../controllers/clients";
import { createFollowup, updateFollowupStatus } from "../controllers/followups";
import { getCalendar } from "../controllers/calendar";
import { createNewClient } from "../controllers/newclients";
import { getClientProfile, updateClientIntake, getClientHome } from "../controllers/profile";
import { createFormData, getMyLatest, health } from "../controllers/formdata";
import { getClientDirectory } from "../controllers/directory"; // ← NEW
import { listAllClients } from "../controllers/clients";

const r = Router();

// public
r.post("/auth/login", login);
r.post("/auth/register", register);

// everything below needs JWT
r.use(requireAuth);

// client area
r.get ("/client/home", requireRole("client","nutritionist","admin"), getClientHome);
r.post("/formdata",     requireRole("client","nutritionist","admin"), createFormData);
r.get ("/formdata/mine/latest", requireRole("client","nutritionist","admin"), getMyLatest);
r.get ("/formdata/health", health);

// staff (nutritionist/admin)
r.get ("/summary", requireRole("nutritionist","admin"), getSummary);

r.get ("/companies/:companyId/clients",                     requireRole("nutritionist","admin"), listCompanyClients);
r.put ("/clients/:clientId",                                requireRole("admin"),                 updateClient);
r.delete("/clients/:clientId",                              requireRole("admin"),                 deleteClient);
r.get ("/companies/:companyId/clients/:clientId/profile",   requireRole("nutritionist","admin"), getClientProfile);
r.patch("/companies/:companyId/clients/:clientId/intake",   requireRole("nutritionist","admin"), updateClientIntake);

r.get ("/calendar",   requireRole("nutritionist","admin"), getCalendar);
r.post("/newclients", requireRole("nutritionist","admin"), createNewClient);

// NEW: Directory endpoint
r.get("/directory/clients", requireRole("nutritionist","admin"), getClientDirectory);
// NEW: directory fetch
r.get("/clients", requireRole("nutritionist","admin"), listAllClients);

export default r;

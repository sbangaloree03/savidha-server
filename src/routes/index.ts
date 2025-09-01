// src/routes/index.ts
import { Router } from "express";
import { requireAuth, requireRole } from "../utils/auth";

import { login, register } from "../controllers/auth";
import { getSummary } from "../controllers/summary";
import { listCompanyClients, updateClient, deleteClient } from "../controllers/clients";
import { createFollowup, updateFollowupStatus } from "../controllers/followups";
import { getCalendar } from "../controllers/calendar";
import { createNewClient, updateNewClient, deleteNewClient } from "../controllers/newclients";
import { getClientProfile, updateClientIntake, getClientHome } from "../controllers/profile";
import { createFormData, getMyLatest, health } from "../controllers/formdata";
// add this import
import {
  getClientDirectory,
  getFormProfileByUserId,
  updateFormUser,          // NEW
  deleteFormUser,          // NEW
} from "../controllers/directory";

import { listAllClients } from "../controllers/clients";
import { listAlerts, markAlertsRead } from "../controllers/alerts";


const r = Router();

// public
r.post("/auth/login", login);
r.post("/auth/register", register);

// auth gate
r.use(requireAuth);

// client area
r.get ("/client/home", requireRole("client","nutritionist","admin"), getClientHome);
r.post("/formdata",     requireRole("client","nutritionist","admin"), createFormData);
r.get ("/formdata/mine/latest", requireRole("client","nutritionist","admin"), getMyLatest);
r.get ("/formdata/health", health);

// staff
r.get ("/summary", requireRole("nutritionist","admin"), getSummary);

r.get ("/companies/:companyId/clients",                     requireRole("nutritionist","admin"), listCompanyClients);
r.put ("/clients/:clientId",                                requireRole("admin", "nutritionist"),                 updateClient);
r.delete("/clients/:clientId",                              requireRole("admin"),                 deleteClient);
r.get ("/companies/:companyId/clients/:clientId/profile",   requireRole("nutritionist","admin"), getClientProfile);
r.patch("/companies/:companyId/clients/:clientId/intake",   requireRole("nutritionist","admin"), updateClientIntake);

r.get ("/calendar",   requireRole("nutritionist","admin"), getCalendar);
r.post("/newclients", requireRole("nutritionist","admin"), createNewClient);

// Directory + clients list
r.get("/directory/clients", requireRole("nutritionist","admin"), getClientDirectory);
// NEW: profile for "Form" rows (user_id is numeric)
r.get("/directory/form/:userId/profile", requireRole("nutritionist","admin"), getFormProfileByUserId);
// NEW: edit/delete for "Form" users
r.put   ("/directory/form/:userId",    requireRole("nutritionist","admin"), updateFormUser);
r.delete("/directory/form/:userId",    requireRole("admin"),                deleteFormUser);
r.get("/clients",            requireRole("nutritionist","admin"), listAllClients);

// Alerts
r.get ("/alerts",             requireRole("nutritionist","admin"), listAlerts);
r.post("/alerts/mark-read",   requireRole("nutritionist","admin"), markAlertsRead);


// Followups
r.post(
  "/companies/:companyId/clients/:clientId/followups",
  requireRole("nutritionist","admin"),
  createFollowup
);

r.patch(
  "/followups/:followupId/status",
  requireRole("nutritionist","admin"),
  updateFollowupStatus
);


export default r;

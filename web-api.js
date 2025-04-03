import express, { json, request } from "express";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { requests } from "./storage.js";

const app = express();

app.use(json());

app.get("/requests", (req, res) => {
  res.json(requests);
});

app.get("/requests/:id", (req, res) => {
  const id = req.params.id;
  if (id in requests) return res.json(requests[id]);

  res.status(404).json({ error: "Request not found" });
});

app.post("/repeat/:id", (req, res) => {
  const id = req.params.id;
  if (id in requests) return res.redirect(requests[id][1]);

  res.status(404).json({ error: "Request not found" });
});

app.post("/scan/:id", (req, res) => {
  // Not implemented
  // Will be in the 4th task
  return res.json({ message: "Too early. Wait for the 4th hw" });
});

export default app;

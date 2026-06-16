import { Hono } from "hono";
import { listSkillOptions } from "../services/skill-service.js";

export const skillRoutes = new Hono();

skillRoutes.get("/", async (c) => {
  return c.json(await listSkillOptions());
});

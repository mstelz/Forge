import { Hono } from "hono";
import { exercisesRoute } from "./exercises";
import { equipmentRoute } from "./equipment";
import { routinesRoute } from "./routines";
import { sessionsRoute } from "./sessions";
import { historyRoute } from "./history";

export const api = new Hono();

api.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

api.route("/exercises", exercisesRoute);
api.route("/equipment", equipmentRoute);
api.route("/routines", routinesRoute);
api.route("/sessions", sessionsRoute);
api.route("/history", historyRoute);

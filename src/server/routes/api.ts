import { Hono } from "hono";
import { exercisesRoute } from "./exercises";
import { equipmentRoute } from "./equipment";
import { routinesRoute } from "./routines";
import { sessionsRoute } from "./sessions";
import { historyRoute } from "./history";
import { programsRoute } from "./programs";
import { programRunsRoute } from "./program-runs";
import { goalsRoute } from "./goals";
import { exportRoute } from "./export";
import { settingsRoute } from "./settings";
import { profileRoute } from "./profile";
import { syncRoute } from "./sync";

export const api = new Hono();

const MIN_CLIENT_VERSION = "0.1.0";

api.use("*", async (c, next) => {
  await next();
  c.header("X-Min-App-Version", MIN_CLIENT_VERSION);
});

api.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

api.route("/exercises", exercisesRoute);
api.route("/equipment", equipmentRoute);
api.route("/routines", routinesRoute);
api.route("/sessions", sessionsRoute);
api.route("/history", historyRoute);
api.route("/programs", programsRoute);
api.route("/program-runs", programRunsRoute);
api.route("/goals", goalsRoute);
api.route("/export", exportRoute);
api.route("/settings", settingsRoute);
api.route("/profile", profileRoute);
api.route("/sync", syncRoute);

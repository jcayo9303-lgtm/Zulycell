import { pino } from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.isProd ? "info" : "debug",
  redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
});

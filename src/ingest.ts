import { Router } from "express";
import { SQLiteStore } from "./db";
import type { Config } from "./config";

export function createIngestRouter(store: SQLiteStore, config: Config): Router {
  const router = Router();

  router.post("/:token", (req, res) => {
    const device = config.devices.find((d) => d.token === req.params.token);
    if (!device) {
      return res.status(401).json({ error: "invalid token" });
    }

    const text = req.body?.text;
    if (typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({ error: "body must include a non-empty `text` string" });
    }

    const sender = typeof req.body?.sender === "string" ? req.body.sender : null;
    const now = Date.now();
    store.insertMessage({
      device_label: device.label,
      body: text,
      sender,
      received_at: now,
      ingested_at: now,
    });

    return res.status(202).json({ ok: true });
  });

  return router;
}

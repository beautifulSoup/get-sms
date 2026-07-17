import { loadConfig } from "./config";
import { SQLiteStore } from "./db";
import { buildApp } from "./server";

const config = loadConfig();
const store = new SQLiteStore(config.dbPath);
const app = buildApp(store, config);

app.listen(config.port, () => {
  console.log(`GetSms listening on :${config.port}`);
  console.log(`  ingest:  POST /ingest/:token   (${config.devices.length} device(s) configured)`);
  console.log(`  mcp:     POST /mcp             (bearer auth)`);
});

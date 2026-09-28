/**
 * Runs the app against a MongoDB on this machine, no Atlas and no credentials needed.
 *
 *   pnpm dev:local          database, indexes and `next dev` together
 *   pnpm dev:local --db     just the database, for running `pnpm dev` or tests beside it
 *
 * Reads .env.local. The database is mongodb-memory-server with its files kept in .data/, so
 * accounts and plans survive a restart. Delete .data/ to start from nothing.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const uri = new URL(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/");
if (!["127.0.0.1", "localhost"].includes(uri.hostname)) {
  throw new Error(`MONGODB_URI points at ${uri.hostname}; dev:local only runs a local database`);
}

const dbPath = ".data/mongo";
mkdirSync(dbPath, { recursive: true });

const mongo = await MongoMemoryServer.create({
  instance: { port: Number(uri.port || 27017), dbPath, storageEngine: "wiredTiger" },
});
console.log(`MongoDB on ${mongo.getUri()} (${process.env.MONGODB_DB}), data in ${dbPath}`);

// Imported after the server is up, since the client connects on first use.
const { ensureIndexes } = await import("@/lib/db/collections");
const { getClient } = await import("@/lib/db/mongo");
await ensureIndexes();
console.log("Indexes ready");

const stop = async (code = 0) => {
  await (await getClient()).close();
  await mongo.stop({ doCleanup: false });
  process.exit(code);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

if (!process.argv.includes("--db")) {
  const port = process.env.PORT ?? "3000";
  const app = spawn("next", ["dev", "--port", port], { stdio: "inherit", shell: true });
  console.log(`App on http://localhost:${port}/projects/whatsfordinner`);
  app.on("exit", (code) => void stop(code ?? 0));
}

import { MongoMemoryServer } from "mongodb-memory-server";
import { getClient } from "@/lib/db/mongo";

/**
 * Starts a real MongoDB for integration tests. The binary is downloaded once and cached,
 * so later runs start in about a second.
 */
export async function startMongo() {
  const server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = "whatsfordinner_test";
  process.env.CODE_PEPPER ??= "test-pepper";

  return {
    uri: server.getUri(),
    async stop() {
      await (await getClient()).close();
      await server.stop();
    },
  };
}

/** Empties every collection between tests without dropping indexes. */
export async function clearCollections() {
  const client = await getClient();
  const db = client.db(process.env.MONGODB_DB);
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

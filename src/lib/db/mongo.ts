import { MongoClient, type Db } from "mongodb";

/**
 * Serverless functions are recycled constantly, so the client is cached on globalThis.
 * Atlas M0 allows 500 connections; one pooled client per warm instance stays well under.
 */
const globalForMongo = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  return new MongoClient(uri, { maxPoolSize: 10 }).connect();
}

export function getClient(): Promise<MongoClient> {
  globalForMongo._mongoClient ??= connect();
  return globalForMongo._mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB ?? "whatsfordinner");
}

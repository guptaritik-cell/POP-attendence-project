import { MongoClient, type Collection } from "mongodb";
import type { ManagerDoc } from "@/types/manager";

const uri = process.env.MONGO_DB;

// Cache the client promise on the global object in development so hot-reloads
// don't spawn a new MongoClient (and a new connection pool) on every reload.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  if (!uri) {
    return Promise.reject(new Error("MONGO_DB env var is not set"));
  }
  const client = new MongoClient(uri);
  return client.connect();
}

const clientPromise: Promise<MongoClient> =
  process.env.NODE_ENV === "development"
    ? (global._mongoClientPromise ??= createClientPromise())
    : createClientPromise();

// Attach a no-op rejection handler at module-eval time so an unreachable/unset
// MONGO_DB doesn't surface as an unhandled promise rejection before anything
// ever awaits this — callers still see the rejection via their own await/catch.
clientPromise.catch(() => {});

export default clientPromise;

export async function getManagersCollection(): Promise<Collection<ManagerDoc>> {
  const client = await clientPromise;
  return client.db().collection<ManagerDoc>("managers");
}

/**
 * Creates the indexes and, optionally, promotes an account to admin.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/setup-db.mts [admin@email]
 *
 * Safe to run repeatedly: index creation is idempotent.
 */
import { ensureIndexes, users } from "../src/lib/db/collections.ts";
import { getClient } from "../src/lib/db/mongo.ts";

const adminEmail = process.argv[2]?.toLowerCase();

await ensureIndexes();
console.log("✓ indexes are in place");

if (adminEmail) {
  const result = await (await users()).updateOne(
    { email: adminEmail },
    { $set: { role: "admin", updatedAt: new Date() } },
  );
  console.log(
    result.matchedCount
      ? `✓ ${adminEmail} is now an admin`
      : `! no account for ${adminEmail} yet — log in once, then run this again`,
  );
}

await (await getClient()).close();

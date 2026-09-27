/**
 * Creates the indexes and, optionally, promotes an account to admin.
 *
 *   pnpm setup-db [admin@email]
 *
 * Safe to run repeatedly: index creation is idempotent.
 */
import { ensureIndexes, users } from "@/lib/db/collections";
import { getClient } from "@/lib/db/mongo";

const adminEmail = process.argv[2]?.toLowerCase();

await ensureIndexes();
console.log("✓ indexes are in place");

if (adminEmail) {
  const result = await (
    await users()
  ).updateOne({ email: adminEmail }, { $set: { role: "admin", updatedAt: new Date() } });
  console.log(
    result.matchedCount
      ? `✓ ${adminEmail} is now an admin`
      : `! no account for ${adminEmail} yet, log in once, then run this again`,
  );
}

await (await getClient()).close();

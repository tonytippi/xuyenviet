import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { userRoles, users } from "../src/db/schema";
import { getDatabaseUrl } from "./db-env";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: pnpm db:promote-admin <email>");
  process.exit(1);
}

const databaseUrl = getDatabaseUrl();
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

async function main() {
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    throw new Error(`No user found for email: ${email}. Log in with Google first, then rerun this command.`);
  }

  await db.insert(userRoles).values([
    { userId: user.id, role: "admin" },
    { userId: user.id, role: "operator" },
  ]).onConflictDoNothing();

  console.log(`Promoted ${user.email} (${user.id}) to admin and operator.`);
}

main()
  .then(async () => {
    await client.end();
  })
  .catch(async (error) => {
    await client.end();
    console.error(error);
    process.exit(1);
  });

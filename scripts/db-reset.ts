import { spawn } from "node:child_process";
import postgres from "postgres";

import { assertLocalDatabaseUrl, getDatabaseUrl } from "./db-env";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function recreateDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, "");
  const maintenanceUrl = new URL(url);

  maintenanceUrl.pathname = "/postgres";

  const sql = postgres(maintenanceUrl.toString(), { max: 1 });
  const escapedDatabaseName = databaseName.replace(/"/g, "\"\"");

  await sql`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${databaseName}
      and pid <> pg_backend_pid()
  `;
  await sql.unsafe(`drop database if exists "${escapedDatabaseName}"`);
  await sql.unsafe(`create database "${escapedDatabaseName}"`);
  await sql.end();
}

async function main() {
  const databaseUrl = getDatabaseUrl();

  assertLocalDatabaseUrl(databaseUrl);
  await recreateDatabase(databaseUrl);
  await run("pnpm", ["db:migrate"]);
  await run("pnpm", ["db:seed"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

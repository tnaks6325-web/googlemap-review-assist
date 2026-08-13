import { spawnSync } from "node:child_process";

const schemaPath = "prisma/schema.postgres.prisma";
const executable = (name) => (process.platform === "win32" ? `${name}.cmd` : name);

function run(command, args) {
  const result = spawnSync(executable(command), args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

// Production schema changes must never use a generic schema push. This exact
// reviewed migration is additive and idempotent, so it is safe to apply before
// the production build that first references the new tables and columns.
if (process.env.VERCEL_ENV === "production") {
  console.log("Applying additive virtual-reviewer schema migration.");
  run("npx", [
    "prisma",
    "db",
    "execute",
    `--schema=${schemaPath}`,
    "--file=prisma/production-review-draft-personas.sql",
  ]);
} else {
  console.log("Skipping automatic production PostgreSQL schema synchronization.");
}

run("npx", ["prisma", "generate", `--schema=${schemaPath}`]);
run("npm", ["run", "build"]);

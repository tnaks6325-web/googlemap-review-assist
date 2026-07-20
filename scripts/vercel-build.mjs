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

// Production is the only environment that changes the shared database schema.
if (process.env.VERCEL_ENV === "production") {
  console.log("Synchronizing the production PostgreSQL schema.");
  run("npx", ["prisma", "db", "push", `--schema=${schemaPath}`, "--skip-generate"]);
} else {
  console.log("Skipping database schema synchronization outside Vercel production.");
}

run("npx", ["prisma", "generate", `--schema=${schemaPath}`]);
run("npm", ["run", "build"]);

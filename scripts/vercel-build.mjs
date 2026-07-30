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

// Production schema changes must be applied through an explicit migration, never an app deploy.
console.log("Skipping automatic production PostgreSQL schema synchronization.");

run("npx", ["prisma", "generate", `--schema=${schemaPath}`]);
run("npm", ["run", "build"]);

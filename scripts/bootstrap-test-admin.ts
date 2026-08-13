import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const isIsolatedTestDeployment =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_ALLOWED_PRODUCTION_BRANCH === "test" &&
  process.env.ALLOW_TEST_DATABASE_SCHEMA_PUSH === "true";

const prisma = new PrismaClient();

async function main() {
  if (!isIsolatedTestDeployment) {
    console.log("test admin bootstrap skipped: not an isolated test deployment");
    return;
  }

  const username = process.env.TEST_ADMIN_BOOTSTRAP_USERNAME?.trim().toLowerCase();
  const password = process.env.TEST_ADMIN_BOOTSTRAP_PASSWORD;

  if (!username && !password) {
    console.log("test admin bootstrap skipped: credentials are not configured");
    return;
  }
  if (!username || !password) {
    throw new Error("TEST_ADMIN_BOOTSTRAP_USERNAME and TEST_ADMIN_BOOTSTRAP_PASSWORD must be set together");
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    throw new Error("TEST_ADMIN_BOOTSTRAP_USERNAME must be a 3-64 character lowercase username");
  }

  const existing = await prisma.admin.findUnique({ where: { email: username } });
  if (existing) {
    console.log("test admin bootstrap skipped: account already exists");
    return;
  }

  await prisma.admin.create({
    data: { email: username, password: hashPassword(password) },
  });
  console.log("test admin bootstrap completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

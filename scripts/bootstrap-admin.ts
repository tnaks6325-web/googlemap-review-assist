import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email && !password) {
    console.log("admin bootstrap skipped");
    return;
  }

  if (!email || !password) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be set together");
  }
  if (!email.includes("@")) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL must be an email address");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters");
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log("admin bootstrap skipped: account already exists");
    return;
  }

  await prisma.admin.create({
    data: {
      email,
      password: hashPassword(password),
    },
  });
  console.log("admin bootstrap completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

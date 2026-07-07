import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

// 테스트 전용 SQLite DB에 스키마를 반영. dev.db와 분리.
// Prisma db push가 일부 Windows/SQLite 환경에서 빈 "Schema engine error"를 내므로,
// diff SQL을 직접 적용해 같은 스키마를 만든다.
export function setup() {
  if (existsSync("prisma/test.db")) unlinkSync("prisma/test.db");
  if (existsSync("prisma/test.db-journal")) unlinkSync("prisma/test.db-journal");
  execSync(
    "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | npx prisma db execute --stdin --schema=prisma/schema.prisma",
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: "file:./test.db" },
    }
  );
}

import { execSync } from "node:child_process";

// 테스트 전용 SQLite DB에 스키마를 반영(비파괴적). dev.db와 분리.
// 테스트는 매 케이스 고유 데이터를 생성하므로 강제 리셋 불필요.
export default function setup() {
  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}

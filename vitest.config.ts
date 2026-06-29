import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    environment: "node",
    fileParallelism: false, // 단일 SQLite test.db 잠금 경합 방지
    hookTimeout: 60000,
    testTimeout: 30000,
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd()) },
  },
});

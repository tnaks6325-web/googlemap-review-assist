import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉토리의 잔여 lockfile로 인한 워크스페이스 루트 오인 방지
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

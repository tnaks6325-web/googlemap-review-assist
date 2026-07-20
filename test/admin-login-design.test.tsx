import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminLoginPage from "@/app/admin/login/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("admin login design", () => {
  it("renders the approved IA Place desktop and mobile brand layout", () => {
    const html = renderToStaticMarkup(<AdminLoginPage />);

    expect(html).toContain("아이에이 플레이스");
    expect(html).toContain('aria-label="아이에이 플레이스"');
    expect(html).toContain("ADMIN");
    expect(html).toContain("운영 계정으로 로그인해 주세요.");
    expect(html).toContain("안전하게 암호화된 연결");
  });

  it("keeps an accessible login form and password visibility control", () => {
    const html = renderToStaticMarkup(<AdminLoginPage />);

    expect(html).toContain("<form");
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="비밀번호 표시"');
    expect(html).toContain('type="submit"');
  });
});

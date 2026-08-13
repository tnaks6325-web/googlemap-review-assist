import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminShell,
  nextAdminDisplayMode,
} from "@/components/admin/AdminShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("admin shell display mode", () => {
  it("switches between desktop and mobile workspace modes", () => {
    expect(nextAdminDisplayMode("desktop")).toBe("mobile");
    expect(nextAdminDisplayMode("mobile")).toBe("desktop");
  });

  it("renders an accessible display-mode switch in the administrator sidebar", () => {
    const html = renderToStaticMarkup(
      <AdminShell current="overview" title="운영 현황" description="현재 작업을 확인합니다.">
        <p>관리자 내용</p>
      </AdminShell>,
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain("PC 모드");
    expect(html).toContain("모바일 모드");
    expect(html).toContain('data-admin-display-mode="desktop"');
  });
});

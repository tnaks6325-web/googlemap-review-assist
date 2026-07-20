import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleSheetConnectionStatus } from "@/components/admin/GoogleSheetConnectionStatus";

describe("GoogleSheetConnectionStatus", () => {
  it("shows the connected spreadsheet title", () => {
    const html = renderToStaticMarkup(
      <GoogleSheetConnectionStatus title="IA 플레이스 광고 요청서" />,
    );

    expect(html).toContain("연결된 시트");
    expect(html).toContain("IA 플레이스 광고 요청서");
  });

  it("keeps the connection status useful when the title cannot be loaded", () => {
    const html = renderToStaticMarkup(
      <GoogleSheetConnectionStatus title={null} />,
    );

    expect(html).toContain("Google Sheet 연동 정상");
    expect(html).not.toContain("연결된 시트");
  });
});

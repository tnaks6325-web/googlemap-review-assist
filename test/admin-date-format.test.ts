import { afterEach, describe, expect, it } from "vitest";
import {
  formatAdminDate,
  formatAdminDateTime,
} from "@/lib/admin-date-format";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("admin date formatting", () => {
  it("renders review submission timestamps in Korea time regardless of the server timezone", () => {
    process.env.TZ = "UTC";
    const utcServer = formatAdminDateTime("2026-07-20T13:30:00.000Z");

    process.env.TZ = "America/New_York";
    const newYorkServer = formatAdminDateTime("2026-07-20T13:30:00.000Z");

    expect(utcServer).toBe("2026. 7. 20. 22:30:00");
    expect(newYorkServer).toBe(utcServer);
  });

  it("renders settlement request dates in Korea time across a UTC date boundary", () => {
    process.env.TZ = "UTC";
    const utcServer = formatAdminDate("2026-07-20T16:30:00.000Z");

    process.env.TZ = "America/New_York";
    const newYorkServer = formatAdminDate("2026-07-20T16:30:00.000Z");

    expect(utcServer).toBe("2026. 7. 21.");
    expect(newYorkServer).toBe(utcServer);
  });
});

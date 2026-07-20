import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  buildErrorNarrative,
  getOperationalErrorSummary,
  listOperationalErrors,
  recordOperationalError,
  resolveOperationalError,
  sanitizeErrorText,
} from "@/lib/error-logging";

describe("error logging", () => {
  beforeEach(async () => {
    await prisma.operationalError.deleteMany();
  });

  it("removes credentials and personal information from technical messages", () => {
    const result = sanitizeErrorText(
      "Authorization: Bearer secret-token email user@example.com phone 010-1234-5678 password=hunter2",
    );

    expect(result).not.toContain("secret-token");
    expect(result).not.toContain("user@example.com");
    expect(result).not.toContain("010-1234-5678");
    expect(result).not.toContain("hunter2");
    expect(result).toContain("[인증정보 제거]");
    expect(result).toContain("[이메일 제거]");
    expect(result).toContain("[전화번호 제거]");
  });

  it("creates an explanation that names the work, stage, impact, and next action", () => {
    const narrative = buildErrorNarrative({
      workflow: "캠페인 가져오기",
      stage: "Google Sheets 내용 읽기",
      situation: "관리자가 캠페인 반영을 실행하던 중이었습니다.",
      cause: "Google 인증 정보가 만료되어 문서에 접근하지 못했습니다.",
      impact: "새 캠페인 정보가 반영되지 않았습니다.",
      action: "Google 연결 권한을 확인한 뒤 다시 실행해 주세요.",
    });

    expect(narrative).toContain("캠페인 가져오기");
    expect(narrative).toContain("Google Sheets 내용 읽기");
    expect(narrative).toContain("인증 정보가 만료");
    expect(narrative).toContain("새 캠페인 정보가 반영되지");
    expect(narrative).toContain("다시 실행해 주세요");
  });

  it("groups repeated errors and reopens a previously resolved error", async () => {
    const input = {
      severity: "ERROR" as const,
      source: "INTEGRATION" as const,
      workflow: "네이버 장소 연결",
      stage: "Place ID 저장",
      code: "NAVER_PLACE_SAVE_FAILED",
      title: "네이버 장소 연결을 저장하지 못했습니다.",
      situation: "관리자가 자동 장소 보정을 실행하던 중이었습니다.",
      cause: "데이터베이스 저장 과정에서 오류가 발생했습니다.",
      impact: "해당 캠페인의 네이버 장소 연결이 완료되지 않았습니다.",
      action: "잠시 후 다시 실행하고 계속 실패하면 데이터베이스 상태를 확인해 주세요.",
      route: "/api/admin/campaigns/abc/naver-place?token=secret",
      method: "POST",
      entityType: "campaign",
      entityId: "abc",
      error: new Error("password=hunter2"),
    };

    const first = await recordOperationalError(input);
    expect(first).not.toBeNull();
    await prisma.operationalError.update({
      where: { id: first!.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    const repeated = await recordOperationalError(input);
    expect(repeated?.id).toBe(first?.id);
    expect(repeated?.occurrenceCount).toBe(2);
    expect(repeated?.status).toBe("OPEN");
    expect(repeated?.route).toBe("/api/admin/campaigns/abc/naver-place");
    expect(repeated?.technicalMessage).not.toContain("hunter2");
  });

  it("lists filtered errors, summarizes open items, and resolves an item", async () => {
    const created = await recordOperationalError({
      severity: "CRITICAL",
      source: "SERVER",
      workflow: "정산 처리",
      stage: "포인트 지급",
      code: "SETTLEMENT_FAILED",
      title: "정산 처리를 완료하지 못했습니다.",
      situation: "관리자가 정산을 승인하던 중이었습니다.",
      cause: "포인트 원장 저장 중 오류가 발생했습니다.",
      impact: "지급 완료 상태로 변경되지 않았습니다.",
      action: "원장 상태를 확인한 뒤 다시 처리해 주세요.",
    });

    const summary = await getOperationalErrorSummary();
    expect(summary.open).toBe(1);
    expect(summary.critical).toBe(1);

    const items = await listOperationalErrors({ severity: "CRITICAL", status: "OPEN" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(created?.id);

    await resolveOperationalError(created!.id);
    expect((await getOperationalErrorSummary()).open).toBe(0);
  });
});

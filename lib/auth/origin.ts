// R7: 상태 변경 요청에 대한 Origin 검증(CSRF 방어).
// - 브라우저는 비-GET 요청에 Origin 헤더를 보낸다 → 교차 출처면 차단.
// - Origin이 없는 비브라우저(서버-서버) 요청은 CSRF 비해당 → 허용.
// 추가 허용 출처는 ALLOWED_ORIGINS(쉼표 구분)로 지정.
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.get("host");
    if (host && o.host === host) return true;
    const allow = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return allow.includes(o.origin);
  } catch {
    return false;
  }
}

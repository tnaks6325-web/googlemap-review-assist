export function GoogleSheetConnectionStatus({
  title,
}: {
  title: string | null;
}) {
  return (
    <div>
      <p className="font-bold text-ink">Google Sheet 연동 정상</p>
      {title ? (
        <div className="mt-2 rounded-[9px] border border-blue-100 bg-white/70 px-3 py-2">
          <p className="text-[11px] font-semibold text-ink-weak">연결된 시트</p>
          <p className="mt-0.5 break-words text-sm font-bold text-ink">
            {title}
          </p>
        </div>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-ink-weak">
        업체명, 장소 URL, 목표 수량과 가이드라인을 검사한 뒤 캠페인으로
        반영합니다.
      </p>
    </div>
  );
}

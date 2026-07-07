import Link from "next/link";
import { Card } from "@/components/ui";

export default function DeprecatedOwnerNewPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Card className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-brand">구조가 변경됐어요</p>
          <h1 className="mt-2 text-[24px] font-bold leading-snug text-ink">
            사장님 매장 등록 화면은 사용하지 않습니다
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-ink-sub">
            이 플랫폼은 운영자가 Google Sheet 접수건을 캠페인으로 만들고, 리뷰어가 진행 중인 캠페인에 참여하는 구조입니다.
          </p>
        </div>

        <div className="space-y-2">
          <Link
            href="/campaigns"
            className="inline-flex h-[52px] w-full items-center justify-center rounded-btn bg-brand px-5 text-base font-medium text-white transition hover:bg-brand-pressed active:scale-[0.98]"
          >
            리뷰어 캠페인 보기
          </Link>
          <Link
            href="/admin/campaigns"
            className="inline-flex h-[52px] w-full items-center justify-center rounded-btn bg-brand-tint px-5 text-base font-medium text-brand transition hover:brightness-95 active:scale-[0.98]"
          >
            운영자 캠페인 관리
          </Link>
        </div>
      </Card>
    </main>
  );
}

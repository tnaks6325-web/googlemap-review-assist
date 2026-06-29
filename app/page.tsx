"use client";

import { useMemo, useState } from "react";
import {
  AmountText,
  Button,
  Card,
  Chip,
  StarRating,
  StepBar,
  TextArea,
  TextInput,
} from "@/components/ui";

const MENUS = ["김치찌개", "제육볶음", "계란말이", "된장국", "공기밥"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-ink-weak">{title}</h2>
      {children}
    </section>
  );
}

export default function DemoPage() {
  const [rating, setRating] = useState(4);
  const [selected, setSelected] = useState<string[]>(["김치찌개", "계란말이"]);

  const toggle = (m: string) =>
    setSelected((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const balance = useMemo(() => 2500, []);

  return (
    <main className="mx-auto max-w-md space-y-10 px-5 py-10">
      <header className="space-y-1">
        <h1 className="text-[22px] font-bold text-ink">디자인 시스템 (토스 스타일)</h1>
        <p className="text-[15px] text-ink-sub">
          무채색 베이스 + 블루 포인트 1색 · 보라톤 미사용
        </p>
      </header>

      <Section title="버튼 / CTA 위계">
        <div className="space-y-3">
          <Button fullWidth>제출하고 적립받기</Button>
          <Button fullWidth variant="secondary">
            다시 생성
          </Button>
          <Button fullWidth variant="text">
            그냥 마치기
          </Button>
          <div className="flex gap-3">
            <Button loading fullWidth>
              처리 중
            </Button>
            <Button disabled fullWidth>
              비활성
            </Button>
          </div>
        </div>
      </Section>

      <Section title="진행 인디케이터">
        <StepBar current={3} total={6} />
      </Section>

      <Section title="별점">
        <StarRating value={rating} onChange={setRating} />
        <p className="text-[15px] text-ink-sub">{rating}점 선택됨</p>
      </Section>

      <Section title="칩 (좋았던 메뉴)">
        <div className="flex flex-wrap gap-2">
          {MENUS.map((m) => (
            <Chip key={m} label={m} selected={selected.includes(m)} onToggle={() => toggle(m)} />
          ))}
        </div>
      </Section>

      <Section title="입력">
        <div className="space-y-3">
          <TextInput placeholder="영수증 승인번호를 입력하세요" />
          <TextArea placeholder="한마디 남겨주세요 (선택)" />
        </div>
      </Section>

      <Section title="금액 강조">
        <div className="flex items-baseline gap-6">
          <AmountText value={500} sign className="text-[28px] text-brand" />
          <AmountText value={balance} className="text-[22px]" />
        </div>
      </Section>

      <Section title="화면 예시 — 적립 완료 (CTA 체인)">
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success-tint">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="var(--color-success)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <AmountText value={500} sign className="text-[26px]" />
          <p className="text-[15px] text-ink-sub">적립 완료</p>
          <p className="rounded-card bg-canvas px-4 py-2.5 text-sm text-ink-sub">
            현재 잔액{" "}
            <span className="font-semibold text-ink">{balance.toLocaleString("ko-KR")}P</span>
          </p>
          <div className="mt-2 w-full space-y-1">
            <p className="mb-2 text-xs text-ink-weak">남긴 내용으로 리뷰 초안을 만들어 드려요</p>
            <Button fullWidth>리뷰 초안 받기</Button>
            <Button fullWidth variant="text">
              그냥 마치기
            </Button>
          </div>
        </Card>
      </Section>
    </main>
  );
}

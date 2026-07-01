import { LegalShell, Section } from "@/components/legal/LegalShell";
import { COMPANY } from "@/lib/legal/company";

export const metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <LegalShell title="이용약관">
      <p>
        본 약관은 {COMPANY.name}(이하 “회사”)가 제공하는 {COMPANY.service}(이하 “서비스”)의 이용
        조건과 회사·이용자의 권리·의무를 규정합니다. 시행일: {COMPANY.effectiveDate}.
      </p>

      <Section n={1} title="목적">
        <p>본 약관은 서비스 이용에 관한 회사와 이용자 간의 권리·의무 및 책임사항을 정함을 목적으로 합니다.</p>
      </Section>

      <Section n={2} title="용어의 정의">
        <p>“이용자”란 고객(리뷰어)과 사장님(광고주)을 포함합니다. “적립금”이란 회사가 정한 기준에 따라
          이용자에게 적립되는 서비스 내 포인트를 말합니다.</p>
      </Section>

      <Section n={3} title="서비스의 내용">
        <p>회사는 영수증으로 방문이 확인된 실제 고객이 자신의 경험을 손쉽게 남기도록 돕는 보조 도구를
          제공합니다. 서비스는 리뷰 “대행 작성”이나 “게시 대행”을 제공하지 않으며, 공개 리뷰의 작성·게시는
          전적으로 이용자의 자율입니다.</p>
      </Section>

      <Section n={4} title="이용자의 의무">
        <p>이용자는 타인의 영수증 도용, 허위 인증, 자동화 도구를 통한 부정 적립 등 서비스의 정상 운영을
          방해하는 행위를 하여서는 안 됩니다. 위반 시 회사는 적립 취소·이용 제한 등의 조치를 할 수 있습니다.</p>
      </Section>

      <Section n={5} title="적립금">
        <p>적립금은 회사가 정한 조건(영수증 인증 및 비공개 피드백 제출 등)을 충족할 때 적립됩니다.
          적립금의 사용·정산·소멸 기준은 서비스 화면 또는 별도 정책에 따릅니다. 정산은 회사의 확인·승인
          절차를 거쳐 지급됩니다.</p>
      </Section>

      <Section n={6} title="리뷰 및 대가 표시">
        <p>회사는 대가성 허위 리뷰를 금지합니다. 적립금은 비공개 피드백 제출에 대한 것이며 공개 리뷰 게시와
          연동되지 않습니다. 관련 세부 원칙은 “리뷰·적립 정책”을 따릅니다.</p>
      </Section>

      <Section n={7} title="책임의 제한">
        <p>회사는 천재지변, 이용자 귀책, 제3자 플랫폼(구글·네이버 등)의 정책 변경 등 회사의 합리적 통제를
          벗어난 사유로 인한 손해에 대하여 관계 법령이 허용하는 범위에서 책임을 지지 않습니다.</p>
      </Section>

      <Section n={8} title="분쟁 해결 및 준거법">
        <p>본 약관은 대한민국 법률에 따라 해석되며, 분쟁은 관계 법령이 정한 절차 및 관할 법원에 따릅니다.
          문의: {COMPANY.email} / {COMPANY.phone}.</p>
      </Section>
    </LegalShell>
  );
}

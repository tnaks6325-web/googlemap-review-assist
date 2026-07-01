import { LegalShell, Section } from "@/components/legal/LegalShell";
import { COMPANY, PROCESSORS } from "@/lib/legal/company";

export const metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <LegalShell title="개인정보 처리방침">
      <p>
        {COMPANY.name}(이하 “회사”)는 「개인정보 보호법」을 준수하며, 이용자의 개인정보를 다음과 같이
        처리합니다. 시행일: {COMPANY.effectiveDate}.
      </p>

      <Section n={1} title="수집하는 개인정보 항목">
        <ul className="list-disc space-y-1 pl-5">
          <li>필수: 휴대폰 번호(본인확인), 영수증 인증정보(인증코드 또는 영수증 이미지)</li>
          <li>서비스 이용: 별점, 선택 메뉴, 한 줄 소감, 생성된 리뷰 초안</li>
          <li>자동 수집: 접속 기록, 기기·브라우저 정보(부정 이용 방지 목적)</li>
        </ul>
      </Section>

      <Section n={2} title="수집·이용 목적">
        <p>본인확인, 영수증 기반 방문 검증, 적립금 적립·정산, 서비스 통계 및 부정 이용 방지.</p>
      </Section>

      <Section n={3} title="보유 및 이용기간">
        <p>수집 목적 달성 후 지체 없이 파기함을 원칙으로 합니다. 다만 관계 법령에서 정한 기간(예: 전자상거래
          관련 기록) 동안 보관할 수 있습니다. 영수증 이미지는 인식(OCR) 처리 후 필요한 최소 기간만 보관합니다.</p>
      </Section>

      <Section n={4} title="제3자 제공">
        <p>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나 이용자의
          동의가 있는 경우에 한합니다.</p>
      </Section>

      <Section n={5} title="처리위탁">
        <p className="mb-2">회사는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁합니다. 일부
          수탁자는 해외에 위치하며, 관련 정보는 처리 목적 달성에 필요한 범위에서 이전됩니다.</p>
        <div className="overflow-hidden rounded-card border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-ink-weak">
              <tr>
                <th className="p-2 text-left font-medium">수탁자</th>
                <th className="p-2 text-left font-medium">위탁 업무</th>
                <th className="p-2 text-left font-medium">위치</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} className="border-t border-line">
                  <td className="p-2 text-ink">{p.name}</td>
                  <td className="p-2">{p.purpose}</td>
                  <td className="p-2">{p.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-ink-weak">
          ※ 영수증 사진 인증 시, 이미지는 문자 인식을 위해 OCR 제공자(Google Cloud Vision)로 전송됩니다.
        </p>
      </Section>

      <Section n={6} title="정보주체의 권리">
        <p>이용자는 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청할 수 있으며, 회사는 관계 법령에
          따라 지체 없이 조치합니다.</p>
      </Section>

      <Section n={7} title="파기 절차 및 방법">
        <p>보유기간이 경과하거나 처리 목적이 달성된 개인정보는 복구 불가능한 방법으로 파기합니다(전자적
          파일은 영구 삭제, 출력물은 분쇄·소각).</p>
      </Section>

      <Section n={8} title="개인정보 보호책임자">
        <p>보호책임자: {COMPANY.privacyOfficer} · 문의: {COMPANY.email} / {COMPANY.phone} ·
          주소: {COMPANY.address}.</p>
      </Section>
    </LegalShell>
  );
}

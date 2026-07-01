// 법무 문서에 들어갈 사업자 정보. 시행 전 실제 값으로 교체할 것(플레이스홀더).
export const COMPANY = {
  service: "리뷰 작성 보조 서비스",
  name: "[[상호(법인/사업자명)]]",
  ceo: "[[대표자명]]",
  bizNo: "[[사업자등록번호]]",
  address: "[[사업장 주소]]",
  email: "[[문의 이메일]]",
  phone: "[[고객센터 전화]]",
  privacyOfficer: "[[개인정보 보호책임자 성명/직책]]",
  effectiveDate: "[[YYYY-MM-DD]]",
};

// 개인정보 처리위탁 현황(실제 사용하는 처리자 반영)
export const PROCESSORS = [
  { name: "Google LLC (Cloud Vision)", purpose: "영수증 이미지 문자 인식(OCR)", region: "해외" },
  { name: "Anthropic PBC (Claude API)", purpose: "리뷰 초안 문장 다듬기(선택 기능)", region: "해외" },
  { name: "[[SMS 발송 대행사]]", purpose: "휴대폰 본인확인 인증문자 발송", region: "국내" },
  { name: "[[클라우드 호스팅 제공자]]", purpose: "서비스 인프라 운영", region: "[[국내/해외]]" },
];

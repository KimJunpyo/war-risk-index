import { FAQ } from "@/entities/guide";
import { SITE_URL } from "@/shared/config/env";
import { HomePage } from "@/views/home";

// 검색엔진·AI 답변 엔진용 구조화 데이터: 사이트 + 데이터셋(출처·갱신 주기) + 자주 묻는 질문
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: "전쟁 가능성 지수",
      alternateName: "War Risk Index", inLanguage: "ko-KR",
    },
    {
      "@type": "Dataset", name: "국가별 전쟁 가능성 지수", url: SITE_URL, inLanguage: "ko-KR",
      description: "국가·국가 쌍별 갈등 뉴스 비율을 과거 기준선과 비교한 점수(50 = 평시, 100 = +2σ)와 UCDP 기반 분쟁 상태",
      temporalCoverage: "2013-04/..", spatialCoverage: "Worldwide",
      isBasedOn: ["https://www.gdeltproject.org/", "https://ucdp.uu.se/"],
      variableMeasured: ["종합 7일 점수", "실시간 24시간 점수", "분쟁 상태"],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // '<' 이스케이프: 문자열이 </script> 로 태그를 닫지 못하게
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <HomePage />
    </>
  );
}

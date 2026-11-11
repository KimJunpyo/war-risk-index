import { DATA_SOURCES } from "../model/sources";

const AUTHOR = "KimJunpyo";
// 저장소는 비공개라 저장소 링크는 두지 않음
const AUTHOR_LINKS = [
  { name: "GitHub", url: "https://github.com/KimJunpyo" },
  { name: "LinkedIn", url: "https://www.linkedin.com/in/%EC%A4%80%ED%91%9C-%EA%B9%80-0bab72265/" },
];
// 상수(plan.md Q8 "© 2026"): 렌더링 때 연도를 계산하면 서버와 브라우저 시간대가 다를 때 연말·연초에 연도가 달라 hydration 불일치가 남
const COPYRIGHT_YEAR = 2026;
const TITLE = "text-sm font-semibold text-neutral-300";
const LINK = "underline decoration-neutral-700 hover:text-neutral-200";

/** 사이트 푸터: 소개·고지 / 데이터 출처 / 만든 사람 + 하단 저작권 바.
 *  md 미만 세로 쌓기, md~lg 미만 2열(왼쪽 소개 위·만든 사람 아래, 오른쪽 출처가 두 행 차지),
 *  lg 이상 3열(소개 1 : 출처 3 : 만든 사람은 내용 폭. 출처 이름이 1080px에서 덜 접히게).
 *  DOM 순서가 곧 Tab 순서라 배치는 grid 위치로만 바꾼다(CSS order 쓰지 않음) */
export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 pt-8 text-xs leading-relaxed text-neutral-400">
      {/* md~lg 미만: 1행은 소개 높이, 2행(1fr)이 출처의 남는 높이를 받아 만든 사람이 소개 바로 아래 붙음 */}
      <div className="grid gap-8 md:grid-cols-2 md:max-lg:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto]">
        <div>
          <p className={TITLE}>전쟁 가능성 지수</p>
          <p className="mt-1">나라·국가 쌍의 갈등 뉴스가 평소 대비 얼마나 튀었는지 보여 주는 점수입니다(개전 예측 아님).</p>
          <p className="mt-3">
            개인이 만든 비영리 실험 프로젝트입니다.
            정부·공공기관·언론사와 관련이 없으며, 정부·민방위·외교부의 공식 경보와 안내가 항상 우선합니다.
          </p>
        </div>
        <section className="md:max-lg:row-span-2">
          <h2 className={TITLE}>데이터 출처</h2>
          {/* 360 터치 간격: 줄 높이 19.5px + gap 8px = 링크 중심 간 27.5px(24px 이상) */}
          <ul className="mt-3 grid gap-2 lg:grid-cols-2 lg:gap-x-6">
            {DATA_SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noreferrer" className={LINK}>{s.name}</a> · {s.use}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className={TITLE}>만든 사람</h2>
          <p className="mt-3">{AUTHOR}</p>
          <ul className="mt-2 flex gap-4">
            {AUTHOR_LINKS.map((l) => (
              <li key={l.name}>
                <a href={l.url} target="_blank" rel="noreferrer" className={LINK}>{l.name}</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-8 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-white/5 pt-4">
        <p>© {COPYRIGHT_YEAR} {AUTHOR}</p>
        <p>데이터 저작권은 각 출처에 있습니다.</p>
      </div>
    </footer>
  );
}

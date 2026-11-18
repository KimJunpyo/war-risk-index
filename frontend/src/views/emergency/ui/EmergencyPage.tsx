import Link from "next/link";
import { ALERT_ICON, ALERT_SOURCES, CIVIL_ALERTS, type CivilAlert } from "@/entities/guide";
import { Icon } from "@/shared/ui";
import { KitCalculator, KitChecklist } from "@/widgets/emergency-kit";
import { SiteFooter } from "@/widgets/site-footer";
import { ALERT_COLOR } from "./alert-color";

const LABEL = "text-xs text-fg-muted";
const SECTION_TITLE = "mb-3 text-sm font-semibold tracking-wide text-fg-soft";
// 경보 뒤 영역(1-5). 목차 칩 글자와 영역 제목에 같은 이름을 쓴다
const KIT = { id: "kit", name: "비상 가방" };
const CALC = { id: "calc", name: "물·식량 계산" };
const TOC = [...CIVIL_ALERTS, KIT, CALC];

/** 비상 대비 안내: 머리말·목차·경보 카드·비상 가방·물·식량 계산·푸터. 정적 페이지라 API 를 부르는 위젯(홈 데이터 위젯 등)은 두지 않는다
 *  (가방 체크 저장·계산기는 브라우저 안에서만 동작하는 클라이언트 위젯, 푸터는 정적 출처 목록만 그림) */
export function EmergencyPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          <span aria-hidden="true">←</span> 전체 지도
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-fg-strong md:text-2xl">비상 대비 안내</h1>
        <p className="mt-1 text-sm text-fg-muted">민방위 경보 5종별 행동요령, 비상 가방 목록, 가구원 수에 맞춘 물·식량 계산을 정리했습니다.</p>
        <p className="mt-3 rounded-xl border border-line px-4 py-3 text-xs text-fg-soft">
          개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.
        </p>
      </header>

      {/* 목차: 지금 있는 영역만 앵커로 건다 */}
      <nav aria-label="목차" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {TOC.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className="inline-block rounded-full border border-line-strong px-3 py-1 text-xs text-fg-soft transition hover:bg-surface-hover"
              >
                {t.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="alerts-title">
        <h2 id="alerts-title" className={SECTION_TITLE}>경보별 행동요령</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {CIVIL_ALERTS.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      </section>

      <section id={KIT.id} aria-labelledby="kit-title" className="mt-10">
        <h2 id="kit-title" className={SECTION_TITLE}>{KIT.name}</h2>
        <KitChecklist />
      </section>

      <section id={CALC.id} aria-labelledby="calc-title" className="mt-10">
        <h2 id="calc-title" className={SECTION_TITLE}>{CALC.name}</h2>
        <KitCalculator />
      </section>

      <SiteFooter />
    </main>
  );
}

/** 경보 카드: 아이콘·이름(경보별 색, 아이콘도 같은 색)·언제·어떻게 알리나·할 일(번호 목록)·출처(새 탭)와 확인일 */
function AlertCard({ alert: a }: { alert: CivilAlert }) {
  return (
    <article id={a.id} className="rounded-2xl border border-line bg-surface p-5">
      <h3 className={`flex items-center gap-2 text-lg font-semibold ${ALERT_COLOR[a.id]}`}>
        <Icon className="h-5 w-5 shrink-0">{ALERT_ICON[a.id]()}</Icon>
        {a.name}
      </h3>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className={LABEL}>언제</dt>
          <dd className="mt-0.5 text-fg">{a.when}</dd>
        </div>
        <div>
          <dt className={LABEL}>어떻게 알리나</dt>
          <dd className="mt-0.5 text-fg">{a.signal}</dd>
        </div>
        <div>
          <dt className={LABEL}>할 일</dt>
          <dd className="mt-1">
            <ol className="list-decimal space-y-1.5 pl-5 text-fg-soft">
              {a.actions.map((x) => <li key={x.id}>{x.text}</li>)}
            </ol>
          </dd>
        </div>
      </dl>
      <p className={`mt-4 ${LABEL}`}>출처 · 문구는 자체 작성</p>
      {/* 360 터치 간격: 줄 높이 19.5px + 간격 8px = 링크 중심 간 27.5px(24px 이상) */}
      <ul className={`mt-1 space-y-2 leading-relaxed ${LABEL}`}>
        {a.sources.map((key) => {
          const s = ALERT_SOURCES[key];
          return (
            <li key={key}>
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-link-line hover:text-fg">
                {s.name}
              </a>{" "}
              ({s.checkedAt} 확인)
            </li>
          );
        })}
      </ul>
    </article>
  );
}

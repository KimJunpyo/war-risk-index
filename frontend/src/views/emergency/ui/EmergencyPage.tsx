import Link from "next/link";
import { ALERT_SOURCES, CIVIL_ALERTS, type CivilAlert } from "@/entities/guide";

// 경보 이름 색(1-1 경보별 토큰). Tailwind 는 소스에 적힌 클래스만 만들므로 id 로 조립하지 않고 글자 그대로 둔다
const ALERT_COLOR: Record<CivilAlert["id"], string> = {
  alert: "text-alert-alert",
  "air-raid": "text-alert-air-raid",
  cbr: "text-alert-cbr",
  nuclear: "text-alert-nuclear",
  "all-clear": "text-alert-all-clear",
};
const LABEL = "text-xs text-fg-muted";

/** 비상 대비 안내: 머리말·목차·경보 카드. 정적 페이지라 API 를 부르는 위젯(홈 데이터 위젯 등)은 두지 않는다 */
export function EmergencyPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          <span aria-hidden="true">←</span> 전체 지도
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-fg-strong md:text-2xl">비상 대비 안내</h1>
        <p className="mt-1 text-sm text-fg-muted">민방위 경보가 울렸을 때 해야 할 일을 경보 종류별로 정리했습니다.</p>
        <p className="mt-3 rounded-xl border border-line px-4 py-3 text-xs text-fg-soft">
          개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.
        </p>
      </header>

      {/* 목차: 지금 있는 영역만 앵커로 건다 */}
      <nav aria-label="목차" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {CIVIL_ALERTS.map((a) => (
            <li key={a.id}>
              <a
                href={`#${a.id}`}
                className="inline-block rounded-full border border-line-strong px-3 py-1 text-xs text-fg-soft transition hover:bg-surface-hover"
              >
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="alerts-title">
        <h2 id="alerts-title" className="mb-3 text-sm font-semibold tracking-wide text-fg-soft">경보별 행동요령</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {CIVIL_ALERTS.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      </section>
    </main>
  );
}

/** 경보 카드: 이름(경보별 색)·언제·어떻게 알리나·할 일(번호 목록)·출처(새 탭)와 확인일 */
function AlertCard({ alert: a }: { alert: CivilAlert }) {
  return (
    <article id={a.id} className="rounded-2xl border border-line bg-surface p-5">
      <h3 className={`text-lg font-semibold ${ALERT_COLOR[a.id]}`}>{a.name}</h3>
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

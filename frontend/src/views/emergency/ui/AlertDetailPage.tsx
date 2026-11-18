import Link from "next/link";
import { ALERT_ICON, ALERT_SOURCES, type CivilAlert } from "@/entities/guide";
import { Icon } from "@/shared/ui";
import { SiteFooter } from "@/widgets/site-footer";
import { ALERT_COLOR } from "./alert-color";
import { KEY_ACTION_ICON, MAP_PIN_ICON } from "./key-action-icons";

const LABEL = "text-xs text-fg-muted";
const BACK_HREF = "/emergency"; // 비상 대비 첫 화면
// 홈 대피소 영역 바로가기(1-4, NearbyShelters 의 section id)와 그 링크를 두는 경보: 지하·대피소로 바로 가야 하는 공습·핵
const SHELTERS_HREF = "/#shelters";
const SHELTER_ALERTS: CivilAlert["id"][] = ["air-raid", "nuclear"];

/** 경보 상세(/emergency/[alert]): 머리말(← 비상 대비·경보 이름·사이렌·언제·고지) → 지금 할 일 3가지 → (공습·핵) 가까운 대피소 찾기
 *  → 더 보기(알리는 방법·행동요령 전체·출처, 처음엔 닫힘) → 푸터. 첫 화면 경보 카드의 문장과 출처를 하나도 빼지 않는다 */
export function AlertDetailPage({ alert: a }: { alert: CivilAlert }) {
  const color = ALERT_COLOR[a.id];
  return (
    <main className="mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <header className="mb-6">
        <Link href={BACK_HREF} className="text-sm text-fg-muted hover:text-fg">
          <span aria-hidden="true">←</span> 비상 대비
        </Link>
        {/* 사이렌 표시는 h1 접근 이름에 넣지 않으려고 h1 밖 같은 줄에 둔다 */}
        <div className="mt-3 flex items-center gap-3">
          <h1 className={`flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl ${color}`}>
            <Icon className="h-7 w-7 shrink-0">{ALERT_ICON[a.id]()}</Icon>
            {a.name}
          </h1>
          {a.siren && <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-sm text-fg-soft">사이렌</span>}
        </div>
        <p className="mt-2 break-keep text-fg">{a.when}</p>
        <p className="mt-1 text-xs text-fg-muted">개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.</p>
      </header>

      <section aria-labelledby="key-actions-title">
        <h2 id="key-actions-title" className="mb-3 text-lg font-semibold text-fg-strong">지금 할 일 3가지</h2>
        {/* 번호는 글자 요소로 그린다(카드 안 왼쪽에 크게). 첫 줄 높이를 번호·아이콘·문장 모두 28px 로 맞추고, 문장은 낱말 중간에서 줄을 바꾸지 않는다 */}
        <ol className="grid gap-3 lg:grid-cols-3">
          {a.keyActions.map((k, i) => (
            <li key={k.from} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className={`w-6 shrink-0 text-center text-2xl font-bold leading-7 ${color}`}>{i + 1}</span>
              <Icon className={`h-7 w-7 shrink-0 ${color}`}>{KEY_ACTION_ICON[k.icon]()}</Icon>
              <span className="min-w-0 break-keep text-lg leading-7 text-fg">{k.text}</span>
            </li>
          ))}
        </ol>
        {SHELTER_ALERTS.includes(a.id) && (
          <Link
            href={SHELTERS_HREF}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-base font-semibold text-fg-strong transition hover:bg-surface-hover"
          >
            <Icon className="h-5 w-5 shrink-0">{MAP_PIN_ICON()}</Icon>
            가까운 대피소 찾기
          </Link>
        )}
      </section>

      <details className="mt-8 rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-fg-soft">더 보기: 알리는 방법 · 행동요령 전체 · 출처</summary>
        <div className="border-t border-line px-5 py-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className={LABEL}>어떻게 알리나</dt>
              <dd className="mt-0.5 text-fg">{a.signal}</dd>
            </div>
            <div>
              <dt className={LABEL}>행동요령 전체</dt>
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
        </div>
      </details>

      <SiteFooter />
    </main>
  );
}

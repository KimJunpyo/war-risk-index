import Link from "next/link";
import { ALERT_ICON, CIVIL_ALERTS } from "@/entities/guide";
import { Icon } from "@/shared/ui";
import { KitCalculator, KitChecklist, KitSummary } from "@/widgets/emergency-kit";
import { SavedShelters } from "@/widgets/nearby-shelters";
import { OfflineStatus } from "@/widgets/offline-status";
import { SiteFooter } from "@/widgets/site-footer";
import { ALERT_COLOR, ALERT_TILE } from "./alert-color";
import { EmbassyDirectory } from "./EmbassyDirectory";

const SECTION_TITLE = "mb-3 text-sm font-semibold tracking-wide text-fg-soft";
// 첫 화면 두 영역(경보 타일·미리 준비하기) 제목. 경보 상세의 "지금 할 일 3가지"와 같은 크기
const SCREEN_TITLE = "mb-3 text-lg font-semibold text-fg-strong";
const DETAIL_BASE = "/emergency"; // 경보 상세(1-5) 주소는 /emergency/{경보 id}
// 경보 타일: 카드 전체가 링크, 높이 80px 이상(plan.md 7-8). 포커스 표시는 가방 타일과 같다
const TILE =
  "flex h-full min-h-20 flex-col rounded-2xl border border-line p-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-soft";
// 경보 뒤 영역(1-5). 첫 화면 준비 카드(KitSummary)와 홈 체크리스트 카드(/emergency#kit)가 이 id 로 온다
const KIT = { id: "kit", name: "비상 가방" };
const CALC = { id: "calc", name: "물·식량 계산" };
const EMBASSY = { id: "embassies", name: "재외공관 연락처" };
// 아이폰 안내 출처: "7-Day Cap on All Script-Writeable Storage"·"Home Screen Web Application Domain Exempt From ITP" 절
const WEBKIT_STORAGE_DOC = "https://webkit.org/tracking-prevention/";

/** 비상 대비 안내 첫 화면: 머리말 → "지금 어떤 경보인가요?" 경보 타일 5개(→ 경보 상세) → "미리 준비하기" 카드(가방 진행·우리 집 물)
 *  → 비상 가방 → 물·식량 계산 → 재외공관 연락처 → 저장한 대피소(#81, 저장본이 있을 때만) → 푸터. 행동요령 문장·출처는 상세의 "더 보기"에 있다. 정적 페이지라 API 를 부르는 위젯(홈 데이터 위젯 등)은
 *  두지 않는다(준비 카드·가방 담기·계산기는 브라우저 안에서만 동작하는 클라이언트 위젯, 푸터는 정적 출처 목록만 그림).
 *  재외공관만 서버에서 받아 HTML 에 넣고 하루 단위로 다시 만든다(#77, 브라우저 요청 없음). 저장한 대피소는 Cache Storage 에서만 읽는다 */
export function EmergencyPage() {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">
          <span aria-hidden="true">←</span> 전체 지도
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-fg-strong md:text-2xl">비상 대비 안내</h1>
        <p className="mt-3 rounded-xl border border-line px-4 py-3 text-xs text-fg-soft">
          개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.
        </p>
        <OfflineStatus />
        {/* Safari 는 7일 동안 쓰지 않은 사이트의 서비스 워커·Cache Storage 를 지울 수 있고 홈 화면 웹 앱은 예외(plan.md 사실 6) */}
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          아이폰·아이패드 Safari는 7일 넘게 이 사이트를 열지 않으면 저장본을 지울 수 있습니다. 공유 → 홈 화면에 추가하면 유지됩니다.{" "}
          <a href={WEBKIT_STORAGE_DOC} target="_blank" rel="noreferrer" className="underline decoration-link-line hover:text-fg">
            WebKit 추적 방지 문서
          </a>
        </p>
      </header>

      <section aria-labelledby="alerts-title">
        <h2 id="alerts-title" className={SCREEN_TITLE}>지금 어떤 경보인가요?</h2>
        {/* 열 수 360 2열·md 3열·lg 이상 5열 한 줄(plan.md 7-7). 5개라 2·3열에서는 마지막(경보해제)이 두 칸을 채운다 */}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {CIVIL_ALERTS.map((a) => (
            <li key={a.id} className="last:col-span-2 lg:last:col-span-1">
              {/* 아이콘·이름은 경보 색(currentColor), 알리는 방법은 siren 에서 만든다(국민안전24 기준 공습·핵만 사이렌) */}
              <Link href={`${DETAIL_BASE}/${a.id}`} className={`${TILE} ${ALERT_TILE[a.id]} ${ALERT_COLOR[a.id]}`}>
                <Icon className="h-6 w-6 shrink-0">{ALERT_ICON[a.id]()}</Icon>
                <span className="mt-2 text-lg font-semibold">{a.name}</span>
                <span className="text-sm text-fg-soft">{a.siren ? "사이렌" : "방송·문자"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="prep-title" className="mt-8">
        <h2 id="prep-title" className={SCREEN_TITLE}>미리 준비하기</h2>
        <KitSummary />
      </section>

      <section id={KIT.id} aria-labelledby="kit-title" className="mt-10">
        <h2 id="kit-title" className={SECTION_TITLE}>{KIT.name}</h2>
        <KitChecklist />
      </section>

      <section id={CALC.id} aria-labelledby="calc-title" className="mt-10">
        <h2 id="calc-title" className={SECTION_TITLE}>{CALC.name}</h2>
        <KitCalculator />
      </section>

      <section id={EMBASSY.id} aria-labelledby="embassies-title" className="mt-10">
        <h2 id="embassies-title" className={SECTION_TITLE}>{EMBASSY.name}</h2>
        <EmbassyDirectory />
      </section>

      <SavedShelters titleClassName={SECTION_TITLE} />

      <SiteFooter />
    </main>
  );
}

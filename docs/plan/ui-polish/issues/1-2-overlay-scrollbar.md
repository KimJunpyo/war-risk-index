# 오버레이 스크롤바 직접 구현: thumb만 표시, 레이아웃 공간 0

## 배경

지금은 브라우저 기본 스크롤바라 Windows에서 밝은 트랙이 어두운 화면 위에 보이고, 클래식 스크롤바가 자리를 차지해 스크롤이 생기거나 없어질 때 내용이 옆으로 밀린다. 사용자 결정(plan.md Q3, 2026-11-10): **새 라이브러리 없이 직접 구현**. 네이티브 스크롤바는 숨기고, 작은 공용 컴포넌트가 thumb만 콘텐츠 위에 겹쳐 그린다. 이렇게 하면 모든 OS에서 레이아웃 공간이 0이고 모양이 같다. 표준 CSS만 쓰는 방식(A)과 OverlayScrollbars(C)는 쓰지 않는다. 비교 근거는 `plan.md` 6절.

## 범위

- 포함
  - 페이지 전체(문서 스크롤)
  - 내부 스크롤 영역: 주목 국가 목록(`widgets/world-map/ui/WorldMap.tsx`, `max-h-[380px] overflow-y-auto`), 뉴스 목록(`widgets/news-feed/ui/NewsFeed.tsx`, `max-h-[720px] overflow-y-auto`), 가이드 모달(`widgets/guide-modal/ui/GuideModal.tsx`, `dialog` 자체 `overflow-y-auto`)
  - 이후 생기는 세로 스크롤 영역(2-x, 3-2)은 이 컴포넌트만 쓴다
- 제외: 가로 스크롤 thumb(가로 스크롤은 plan.md 원칙 1에 따라 만들지 않음), 스크롤 동작 변경(부드러운 스크롤·관성), 트랙 클릭으로 페이지 이동, 스크롤 화살표 버튼, 새 라이브러리

## 동작 정의 (최소 기능)

- **숨김**: 대상 스크롤 컨테이너(페이지는 `html`)에 `scrollbar-width: none`과 `::-webkit-scrollbar { display: none }`. 스크롤 기능 자체는 그대로 둔다(`overflow`는 기존 값 유지).
- **thumb만 표시**: 트랙(배경 띠)은 그리지 않는다. thumb는 오른쪽 끝에 겹쳐 그리는 둥근 막대. 색·두께·최소 길이·여백·숨김 지연 시간은 CSS 변수 또는 상수로 둔다(제안: 두께 6px, hover 시 8px, 최소 길이 24px, 숨김 지연 800ms).
- **스크롤 위치 반영**: `scroll` 이벤트와 `ResizeObserver`(컨테이너·내용 크기 변화)로 thumb 길이·위치를 갱신한다. 내용이 넘치지 않으면 thumb를 렌더링하지 않는다.
- **드래그**: thumb를 pointer로 끌면 끈 거리를 스크롤 위치로 환산해 반영한다. `setPointerCapture`로 영역 밖으로 나가도 계속 끌린다. 끄는 동안 텍스트 선택이 되지 않는다.
- **표시 시점**: 스크롤 중이거나, 컨테이너에 마우스를 올렸거나, thumb를 끄는 중에 보이고, 그 밖에는 숨김 지연 뒤 흐려진다(opacity 0). 터치 환경에서는 스크롤 중에만 보인다.
- **네이티브 스크롤 유지**: 휠, 트랙패드, 터치, 키보드(방향키·PageUp/Down·Space·Home/End), Tab 포커스 이동에 따른 자동 스크롤은 브라우저 기본 동작 그대로다. thumb는 보조 표시와 드래그만 담당한다.
- **접근성**: thumb는 `aria-hidden="true"`, 포커스 받지 않음. 스크린리더 탐색은 네이티브 스크롤로 동작한다.
- **동작 줄이기**: `prefers-reduced-motion: reduce`에서 thumb 나타남·사라짐 전환 애니메이션 없이 즉시 바뀐다(기존 전역 규칙 `globals.css`와 충돌 없게 확인).
- **페이지 전체**: 문서 스크롤의 thumb는 뷰포트 오른쪽 끝에 `position: fixed`로 그린다. 가이드 모달이 열리면 모달은 브라우저 top layer라 페이지 thumb 위에 놓이고, 모달 안 스크롤은 모달 자체 thumb가 담당한다.
- **가이드 모달**: 상단 닫기 줄(`sticky`)이 thumb를 가리지 않도록 thumb 영역은 sticky 줄 아래에서 시작하거나 z-index로 위에 그린다(방법은 PR에 적는다).

## 할 일

1. **순수 함수**: thumb 길이·위치 계산과 드래그 거리 → 스크롤 위치 환산을 별칭(`@/`) 없는 순수 함수로 둔다. 예: `shared/lib/scrollbar.ts`의 `thumbMetrics({ clientHeight, scrollHeight, scrollTop, minThumb })` → `{ visible, size, offset }`, `scrollTopFromDrag({ startScrollTop, deltaY, clientHeight, scrollHeight, thumbSize })`. 상수(최소 길이 등)는 같은 파일에 둔다.
2. **테스트**: `shared/lib/scrollbar.test.ts`(`node --test`): 넘치지 않음(`scrollHeight <= clientHeight`) → `visible: false`, 맨 위·맨 아래 위치, 최소 길이 보정 시 맨 아래에서 thumb 끝이 트랙 끝과 일치, 드래그 환산의 양 끝 보정(0 미만·최대 초과 없음), 소수 입력.
3. **공용 훅·컴포넌트**: `shared/ui/`에 하나(예: `useOverlayScrollbar(ref)` 훅 + 내부 스크롤용 `ScrollArea` 컴포넌트, 페이지용 `PageScrollbar`). 이벤트 리스너·`ResizeObserver`는 언마운트 시 해제한다. `scroll` 처리는 `requestAnimationFrame`으로 한 프레임에 한 번만 갱신한다.
4. **스타일**: `globals.css`에 숨김 규칙(`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`)을 유틸리티(예: `@utility no-native-scrollbar`)로 두고 대상에만 적용한다. thumb 색은 `:root` CSS 변수.
5. **적용**: `app/layout.tsx`(또는 `HomePage.tsx`)에 페이지용, 주목 국가 목록·뉴스 목록·가이드 모달에 내부용을 적용한다.
6. **소스 grep 테스트**(`tests/`): `globals.css`에 `scrollbar-width: none`과 `::-webkit-scrollbar` `display: none`이 있다, 대상 세 위젯이 공용 컴포넌트를 import 한다, `frontend/package.json` 의존성에 스크롤바 라이브러리가 없다(예: `overlayscrollbars`, `simplebar` 이름 0건).

## 인수 조건

- [ ] `node --test frontend/src/**/*.test.ts`에 `scrollbar.test.ts`가 포함되고 위 경우를 모두 다루며 통과한다.
- [ ] `frontend/package.json`의 `dependencies`·`devDependencies`가 이 이슈 전과 같다.
- [ ] Windows Chrome·Windows Edge·Windows Firefox 최신판에서 페이지와 세 내부 영역 각각의 `offsetWidth - clientWidth`가 0이다(페이지는 `window.innerWidth - document.documentElement.clientWidth`가 0).
- [ ] 같은 환경에서 뉴스 기간을 바꿔 목록 스크롤이 생기거나 없어질 때 목록 첫 항목의 `getBoundingClientRect().left`·`right`·`width` 변화가 0px이다.
- [ ] 네이티브 스크롤바(트랙·화살표)가 보이지 않고, 스크롤하면 thumb만 보인다(스크린샷).
- [ ] 내용이 넘치지 않는 영역(예: 뉴스 3건)에는 thumb 요소가 DOM에 없다.
- [ ] thumb 위치가 스크롤과 함께 움직이고, 맨 아래까지 스크롤하면 thumb 아래 끝과 영역 아래 끝 차이가 1px 이하다.
- [ ] thumb를 끌면 내용이 따라 스크롤되고, 끝까지 끌면 마지막 항목이 보이며, 끄는 동안 텍스트가 선택되지 않는다. 포인터가 영역 밖으로 나가도 끌기가 이어진다.
- [ ] 스크롤을 멈추고 마우스를 영역 밖으로 옮기면 숨김 지연(상수 값) 뒤 thumb의 계산된 `opacity`가 0이다. 마우스를 올리면 다시 보인다.
- [ ] 마우스 휠, 키보드(방향키, PageDown, End), Tab 포커스 이동, 터치(기기 모드) 스크롤이 네 곳 모두 동작한다.
- [ ] thumb 요소에 `aria-hidden="true"`가 있고 Tab으로 포커스되지 않는다.
- [ ] 개발자 도구 Rendering에서 `prefers-reduced-motion: reduce`를 켜면 thumb의 `transition-duration`이 0(또는 0.01ms 이하)이다.
- [ ] 가이드 모달을 열면 모달 안 thumb가 보이고 닫기 줄이 thumb를 가리지 않으며, 모달을 닫으면 페이지 thumb가 그대로 동작한다.
- [ ] 1분 동안 연속 스크롤 시 개발자 도구 Performance에서 thumb 갱신 때문에 50ms 넘는 long task가 생기지 않는다.
- [ ] macOS·iOS 환경에서 thumb가 이중으로 보이지 않는다(실기기로 확인 못 하면 PR에 "확인 못 함"으로 명시).
- [ ] 위 소스 grep 테스트가 `tests/`에 추가돼 통과한다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 네 곳을 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 확인 못 한 것 (구현 중 확인)

- `dialog` top layer 안에서 `position: fixed`·sticky 요소와 thumb가 겹칠 때의 순서: 확실하지 않음.
- Safari에서 `scrollbar-width: none`과 `::-webkit-scrollbar { display: none }`을 함께 썼을 때 네이티브 스크롤바가 완전히 사라지는지: 확실하지 않음(Safari 18.2부터 `scrollbar-width` 지원).

## 영향 파일

- `frontend/src/shared/lib/scrollbar.ts`, `frontend/src/shared/lib/scrollbar.test.ts` (신규, 이름은 제안), `frontend/src/shared/lib/index.ts`
- `frontend/src/shared/ui/` (신규 훅·컴포넌트), `frontend/src/shared/ui/index.ts`
- `frontend/app/globals.css`
- `frontend/app/layout.tsx` 또는 `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/widgets/world-map/ui/WorldMap.tsx`
- `frontend/src/widgets/news-feed/ui/NewsFeed.tsx`
- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `tests/test_ui_scrollbar.py` (신규, 이름은 제안)

## 관련 시안

없음(이 이슈 "동작 정의", `plan.md` 6절)

## 선행 이슈

없음(1-1과 병렬 가능)

## 라벨

`enhancement`

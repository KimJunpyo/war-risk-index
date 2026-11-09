# 뉴스룸 위협 신호 프론트엔드 제거

## 배경

홈 화면의 "🛰 뉴스룸 위협 신호" 패널(ThreatPanel)은 국방·안보 매체 RSS 기사 제목·요약에서 위협 표현을 키워드로 찾은 실험 신호다. 사용자 측정 AUC 0.23으로 예측력이 없고, 타국 기사가 섞인다. 대표 지수에도 반영되지 않는다. 백엔드를 먼저 지우면 화면이 오류를 띄우므로 소비하는 쪽(프론트)부터 지운다.

## 범위

- 포함: ThreatPanel 위젯, threat 엔티티, 홈 화면의 사용처
- 제외: 백엔드 `/api/threat`와 수집 스크립트(1-2)

## 할 일

1. 삭제 대상 목록을 PR 설명에 먼저 적고 사용자 확인을 받는다.
   - 삭제할 디렉터리: `frontend/src/widgets/threat-panel/`(`index.ts`, `ui/ThreatPanel.tsx`), `frontend/src/entities/threat/`(`index.ts`, `api/use-threat.ts`, `model/types.ts`)
   - 수정할 파일: `frontend/src/views/home/ui/HomePage.tsx` 16행 import, 140행 `<ThreatPanel basePath={summary.basePath} />`
2. 위 파일을 삭제·수정한다.
3. 그리드(`lg:grid-cols-[minmax(0,1fr)_360px]`)에서 ThreatPanel이 빠진 뒤 빈 칸이 생기지 않는지 확인한다.
4. FAQ(`frontend/src/entities/guide/model/faq.ts`), `frontend/public/llms.txt`, footer(`HomePage.tsx`), `frontend/app/page.tsx` 구조화 데이터에 위협 신호 언급이 없음을 grep으로 확인한다(2026-11-09 기준 0건, 수정 불필요 예상).

## 인수 조건

- [ ] PR 설명에 삭제 대상 파일 목록(위 5개 파일 + 수정 1개)이 있고, 사용자가 확인한 뒤 병합된다.
- [ ] `frontend/src`에서 `ThreatPanel|useThreat|entities/threat|/api/threat|뉴스룸` grep 결과 0건이다.
- [ ] `frontend/public/llms.txt`, `faq.ts`, `app/page.tsx`에서 `뉴스룸|위협 신호|threat` grep 결과 0건이다.
- [ ] 홈 화면을 열었을 때 개발자 도구 Network에 `/api/threat` 요청이 0건이다.
- [ ] 화면 폭 1280px에서 국가(대한민국)와 국가 쌍(남북)을 각각 선택했을 때 RiskHistory·NewsFeed·CatalystPanel이 표시되고 그리드에 빈 칸이 없다.
- [ ] 화면 폭 375px에서 같은 확인을 했을 때 패널이 세로로 빈 칸 없이 쌓인다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 확인했고 개발자 도구 콘솔 오류 0건이다.

## 영향 파일

- 삭제: `frontend/src/widgets/threat-panel/index.ts`, `frontend/src/widgets/threat-panel/ui/ThreatPanel.tsx`, `frontend/src/entities/threat/index.ts`, `frontend/src/entities/threat/api/use-threat.ts`, `frontend/src/entities/threat/model/types.ts`
- 수정: `frontend/src/views/home/ui/HomePage.tsx`
- 확인만: `frontend/src/entities/guide/model/faq.ts`, `frontend/public/llms.txt`, `frontend/app/page.tsx`

## 관련 시안

없음 (`docs/design/` 없음)

## 선행 이슈

없음. 단, 현재 브랜치의 커밋되지 않은 변경 18건 정리 후 시작(plan.md Q20).

## 라벨

`enhancement`

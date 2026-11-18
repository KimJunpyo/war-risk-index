# 아이콘 방식 확정과 경보 아이콘

기준 코드: `023aa29`(`main`, 2026-11-18)

## 배경

- **아이콘이 필요한 곳:** 개편 화면은 경보 타일, 핵심 행동 카드, 가방 타일, −/+·복사 버튼에 아이콘을 쓴다. 모두 합쳐 약 30개다.
- **지금 상태:** 프론트에 아이콘 라이브러리가 없다. 홈 헤더 "비상 대비" 링크의 경광등 하나만 인라인 SVG다(`HomePage.tsx`).
- **결정(plan.md Q1, 2026-11-18):**
  - 인라인 SVG로 넣되 그림(path)은 lucide(ISC)에서 필요한 것만 옮긴다(C). 새 패키지 0개이고, 서버 컴포넌트에서 그려 브라우저 JS가 늘지 않는다.
  - `lucide-react`는 더하지 않는다. 1.74.0의 `Icon`은 `"use client"` 모듈이라 서버 컴포넌트에서 써도 아이콘 JS가 브라우저로 간다(plan.md 사실 4).
  - lucide에 없는 그림(방독면·계단 등)은 같은 틀(24×24, 선 두께 2)로 직접 그린다.
- **이 이슈의 범위:** 아이콘 틀과 경보 아이콘 5개만 만든다.
  - 다른 아이콘은 쓰는 이슈가 더한다: 핵심 행동(1-5), 가방 항목(1-6), −/+(1-7), 복사·체크(1-6, 1-8).
  - 첫 사용처는 지금 `/emergency` 경보 카드 제목이다. 같은 대응표를 상세 h1(1-5)과 첫 화면 타일(1-9)이 쓴다.

## 범위

- **포함:**
  - 아이콘 틀(위치 제안 `frontend/src/shared/ui/Icon.tsx`): 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `aria-hidden="true"`, `focusable="false"`, 크기는 `className`으로 받는다.
  - 경보 아이콘 대응표(위치 제안 `frontend/src/entities/guide/ui/alert-icons.tsx`): `ALERT_ICON: Record<CivilAlert["id"], …>`
    - 그림 제안(lucide 이름): 경계 `megaphone`, 공습 `siren`, 화생방 `biohazard`, 핵 `radiation`, 해제 `shield-check`. 최종은 PR 스크린숏으로 정한다.
  - 아이콘 파일 머리의 lucide ISC 고지(저작권·허가 문구)와 출처 URL
  - 지금 `/emergency` 경보 카드 제목(`h3`) 앞에 경보 아이콘
  - 테스트
- **제외:**
  - 핵심 행동·가방·계산기 아이콘(1-5~1-8)
  - 홈 헤더 경광등 교체(그대로 둔다)
  - 색 토큰 추가(아이콘은 글자 색을 따른다)

## 인수 조건

- [ ] `frontend/package.json`·`package-lock.json`이 바뀌지 않았다(새 패키지 0개). [명령]
- [ ] `/emergency` 경보 카드 제목마다 `svg` 하나가 있고, `aria-hidden="true"`다. [테스트]
- [ ] 그 `svg`의 계산된 `stroke` 색이 같은 제목 글자의 계산된 `color`와 같다(경보 토큰 색을 따른다). [테스트]
- [ ] 경보 카드 제목의 접근 이름은 아이콘을 넣은 뒤에도 경보 이름 그대로다. 기존 `e2e/emergency.spec.ts`가 바꾸지 않고 통과한다. [테스트]
- [ ] `ALERT_ICON`이 `CIVIL_ALERTS`의 id 5개를 모두 키로 가진다. 빠지면 `npx tsc --noEmit`이 실패한다(`Record` 타입). [명령]
- [ ] 라이선스·서버 렌더: [테스트]
  - 아이콘 파일 머리 주석에 "ISC"와 lucide 저작권 문구, 출처 URL(`https://lucide.dev`)이 있다(pytest, 이름 제안 `tests/test_m17_icons.py`).
  - 아이콘 틀·대응표 파일에 `"use client"`가 없다.
- [ ] `npm run build` 경로 표에서 `/emergency`가 여전히 `○`(Static)이다. [명령]
- [ ] 빌드 결과 `.next/static/chunks` 전체 크기를 바꾸기 전·후로 PR 본문에 적는다. 늘어난 크기는 1KB 이하다. [명령]
- [ ] `e2e/contrast.spec.ts`의 `/emergency` 기본 상태가 4폭에서 통과한다. [테스트]
- [ ] 360·1440px 경보 카드 제목 스크린숏(바꾸기 전·후)이 PR 본문에 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/src/shared/ui/Icon.tsx`(신규), `frontend/src/shared/ui/index.ts`
- `frontend/src/entities/guide/ui/alert-icons.tsx`(신규), `frontend/src/entities/guide/index.ts`
- `frontend/src/views/emergency/ui/EmergencyPage.tsx`(경보 카드 제목)
- `frontend/e2e/emergency.spec.ts`(아이콘 단언 추가)
- `tests/test_m17_icons.py`(신규)

## 관련 시안

없음(`docs/design/` 없음). plan.md 7-1 타일, 7-2 상세 h1, 7-8 접근성 기준

## 선행 이슈

- 없음(plan.md Q1은 2026-11-18에 C로 결정)
- 기존: #71(토큰), #72(경보 id)

## 라벨

`enhancement`

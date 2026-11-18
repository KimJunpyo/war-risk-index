# 오프라인 안내·저장 시각·아이폰 안내·설치 조건

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **저장 시각:**
  - 저장본은 오래될 수 있다.
  - 언제 저장됐는지 보여 줘야, 오래된 정보를 지금 정보로 오해하지 않는다.
- **Safari 저장소 삭제:**
  - Safari는 7일 동안 사이트를 쓰지 않으면 서비스 워커와 Cache Storage를 지울 수 있다.
  - 홈 화면에 추가한 웹 앱은 예외다(plan.md 사실 6).
- **설치 조건:**
  - 홈 화면에 추가(설치)하려면 manifest가 브라우저 설치 조건을 맞춰야 한다.
  - 지금 아이콘은 SVG와 180px PNG뿐이다. Chrome 조건을 맞추는지는 확실하지 않다.

## 범위

- **포함:**
  - `/emergency` 머리말의 저장 상태 줄
    - 온라인: "이 기기에 저장됨 · 저장 YYYY-MM-DD HH:mm"
    - 오프라인: "오프라인: 저장된 안내입니다 · 저장 …"
  - 아이폰·아이패드 안내 한 줄(출처 링크)
  - manifest 설치 조건 확인과 보완
- **제외:**
  - 설치 버튼(`beforeinstallprompt`). 브라우저마다 달라 Next 문서도 권하지 않는다.
  - 저장 내용을 손으로 새로 고치는 버튼

## 인수 조건

- [ ] 서비스 워커가 `/emergency`를 저장한 뒤 머리말에 저장 시각이 보인다. 그 값은 Cache Storage `/emergency` 응답의 `date` 헤더를 한국 시각(KST)으로 바꾼 값과 같다. [수동]
- [ ] 브라우저가 오프라인이 되면(`offline` 이벤트) 1초 안에 "오프라인" 안내가 보이고, 온라인이 되면 사라진다. [테스트]
- [ ] 서비스 워커를 지원하지 않거나 저장본이 없으면 저장 상태 줄이 보이지 않는다. [테스트]
- [ ] 머리말 아래에 아이폰 안내 문구와 WebKit 문서 링크가 있다. [테스트]
  - 문구 제안: "아이폰·아이패드 Safari는 7일 넘게 이 사이트를 열지 않으면 저장본을 지울 수 있습니다. 공유 → 홈 화면에 추가하면 유지됩니다."
- [ ] Chrome 개발자 도구 Application > Manifest에 설치(Installability) 오류가 0건이다. [수동]
  - 오류가 있으면 192px·512px PNG 아이콘을 더해 0건으로 만든다.
  - 아이콘은 지금과 같은 그림이고, 새 의존성은 쓰지 않는다.
- [ ] Android Chrome 또는 아이폰 Safari 중 1대 이상에서 다음을 확인한다. 기기와 날짜를 PR에 적는다. [수동]
  1. 홈 화면에 추가한다.
  2. 비행기 모드로 바꾼다.
  3. 홈 화면 아이콘으로 실행한다.
  4. `/emergency` 내용이 보인다.
- [ ] `e2e/contrast.spec.ts`에 오프라인 안내가 보이는 상태를 넣었고, 4폭에서 통과한다. [테스트]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/src/views/emergency/`(머리말)
- 저장 상태 클라이언트 컴포넌트(위치 제안: `frontend/src/widgets/offline-status/`)
- `frontend/app/manifest.ts`, 아이콘 파일(필요할 때만)
- `frontend/e2e/emergency.spec.ts`, `frontend/e2e/contrast.spec.ts`

## 관련 시안

없음(plan.md 7-1)

## 선행 이슈

- 2-3: 서비스 워커

## 라벨

`enhancement`

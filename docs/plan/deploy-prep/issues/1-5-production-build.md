# 프로덕션 빌드·실행 확인과 메모리 측정

## 배경

지금까지는 모든 확인을 `next dev`로만 했다. 서버에서는 `next build` 뒤 `next start`로 실행하므로 아래를 미리 확인해야 한다(`plan.md` 4절 사실 5).

**프로덕션 빌드에서 달라지는 점**
- **빌드 때 렌더링:** `cacheComponents: true`라서 클라이언트 컴포넌트도 빌드할 때 미리 렌더링된다.
  - 렌더 중에 현재 시각을 읽으면 빌드 오류가 날 수 있다(Next 문서 `03-api-reference/04-functions/io.md`).
  - 후보: `frontend/src/shared/lib/format.ts:5`의 기본값 `Date.now()`, `shared/lib/use-now.ts`
- **빌드 때 박히는 값:** `NEXT_PUBLIC_API_BASE_URL`과 `NEXT_PUBLIC_SITE_URL`은 빌드할 때 박힌다. `SITE_URL`은 canonical, `robots.txt`, `sitemap.xml`, OG 이미지 주소에 쓰인다.
- **글꼴:** `next/font/google`이 빌드 때 글꼴을 내려받는다.
- **메타데이터 경로:** `robots.ts`, `sitemap.ts`, `manifest.ts`, `opengraph-image.tsx`, `apple-icon.tsx`, `icon.svg`는 dev와 다르게 빌드 산출물로 나간다.

**서버 사양(Q2) 결정에 필요한 측정**
- 아는 값은 백엔드 기동 직후 메모리(Working Set 약 232MB, Private 약 557MB)뿐이다.
- 지수 재계산과 `next build`의 최대치를 재야 서버 사양을 정할 수 있다.

## 범위

- **포함:**
  - 로컬 프로덕션 빌드·실행 확인과, 빌드를 막는 오류 수정
  - 메모리·시간 측정과 기록
- **제외:**
  - 서버에서의 빌드·측정(3-1)
  - 성능 최적화
  - `next.config.ts` 기능 추가
  - 화면 변경

## 할 일

1. **시작 시점:** use-now 개발 모드 경고 수정은 PR #33으로 `main`에 머지됐다(`d209f80`, 2026-11-11). 1-4가 머지된 `main`에서 시작한다.
2. **빌드:** `frontend`에서 실행한다. 환경변수는 셸에서 넣고, `frontend/.env*` 파일로 남기지 않는다.
   ```powershell
   $env:NEXT_PUBLIC_SITE_URL='https://example.com'; $env:NEXT_PUBLIC_API_BASE_URL='http://localhost:8000'; npm run build
   ```
   - 빌드 출력의 경로 표(route table)를 PR에 붙인다.
   - 빌드 오류가 나면 PR에 원인을 먼저 설명하고 고친다.
   - 고치기 전에 `frontend/AGENTS.md` 지시대로 `node_modules/next/dist/docs/`의 해당 문서를 읽는다. 예: `03-api-reference/04-functions/io.md`, `02-guides/migrating-to-cache-components.md`
3. **실행:** 같은 셸에서 `npm run start`(포트 3000)를 띄우고, 백엔드(:8000)도 함께 띄워 확인한다.
4. **측정:** 결과는 PR 본문에 적고, 2-2에서 런북 "서버 사양" 절로 옮긴다.
   - 측정 항목
     - `next build`에 걸린 시간
     - 빌드 중 node 프로세스 Working Set 합계의 최댓값
     - `next start` 기동 뒤 Working Set
     - 백엔드 기동 직후 Working Set
     - `build_country_index.main()`과 `build_index.main()`을 실행하는 별도 파이썬 프로세스의 `PeakWorkingSet64`
   - 측정 방법
     - PowerShell `Get-Process`로 0.5초마다 값을 읽어 최댓값을 기록한다. `PeakWorkingSet64`는 `Refresh()`한 뒤 읽는다.
     - 측정하는 동안에는 다른 node 프로세스(다른 작업의 개발 서버 등)를 띄우지 않는다. 합계에 섞이기 때문이다.
     - 1-4가 머지된 뒤에 잰다. matplotlib을 불러오지 않는 상태가 기준이다.
     - Windows Working Set은 리눅스 RSS와 다른 참고치다. 서버 실측은 3-1에서 한다.

## 인수 조건

### 로컬에서 확인

- [ ] 위 환경변수로 `npm run build`가 종료 코드 0으로 끝난다. [명령]
- [ ] 빌드 출력에 `next.config` 관련 경고(알 수 없는 키 등)가 없다. 있으면 PR에 원문과 판단을 적는다. [명령]
- [ ] `npm run start` 뒤 아래 경로가 모두 200이다. `curl.exe -s -o NUL -w "%{http_code}" <주소>`로 확인한다. [명령]
  - `/`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`
  - `/icon.svg`, `/apple-icon`, `/llms.txt`
- [ ] `/` HTML의 `og:image` 주소가 200이고 `Content-Type`이 `image/png`다. [명령]
- [ ] 다음이 모두 `https://example.com`으로 시작하고, 세 곳 어디에도 `localhost`가 없다. [명령]
  - `/robots.txt`의 `Sitemap:` 줄
  - `/sitemap.xml`의 `<loc>`
  - `/` HTML의 canonical 링크
- [ ] 브라우저 폭 360·1440px에서 `next start` 화면이 `next dev`와 같이 동작한다. 콘솔 오류는 하이드레이션(hydration) 오류를 포함해 0건이다. [수동]
  - 지도, 국가 쌍 탭, 추이 차트, 뉴스
  - 한국 선택 → 지역 대피소 조회
- [ ] 개발자 도구 Network에서 API 요청이 모두 `http://localhost:8000/api/...`로 간다. 빌드 때 넣은 값이 반영됐다는 뜻이다. [수동]
- [ ] PR 본문에 측정값 5개와 측정 방법이 있다. [수동]
  - 빌드 시간, 빌드 최대 메모리, `next start` 메모리, 백엔드 기동 직후, 지수 재계산 최대
- [ ] 빌드를 위해 코드를 고쳤다면 다음을 모두 확인한다. [명령]
  - `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건
  - 루트에서 `node --test frontend/src/**/*.test.ts` 통과
  - `npm run dev` 화면도 같은 동작
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-1: 서버에서 빌드하고 Caddy를 거쳐 같은 경로들이 200인지 확인한다. 첫 캐치업 뒤 백엔드 `VmHWM`을 잰다.

## 영향 파일

- 빌드가 바로 성공하면 코드 변경이 없다. PR에는 측정 기록만 남긴다.
- 오류가 나면 원인 파일을 고친다. 예상 후보: `frontend/src/shared/lib/format.ts`, `frontend/src/shared/lib/use-now.ts`

## 관련 시안

없음(`plan.md` 4절 사실 5)

## 선행 이슈

- 1-4: 메모리를 matplotlib 없는 상태로 재기 위해서
- 외부: use-now 개발 모드 경고 수정(PR #33, 2026-11-11 머지 완료)

## 라벨

`enhancement`

# war-risk-index 운영 런북

Cloudflare Workers 구조(M12)를 운영하는 순서다. 서버(VM)는 없다. 15분마다 GitHub Actions가 배치를 돌려 R2에 올리고, Worker가 R2의 파일을 API로 내주고, 화면은 Vercel이 내준다.

- 대상: 운영자 한 명. 명령은 Windows PowerShell 기준이고, 따로 적지 않으면 저장소 루트에서 실행한다.
- 비밀값(토큰·키)은 화면·로그·커밋에 남기지 않는다. 명령에는 환경변수로 넣는다. 저장소가 공개라 Actions 로그도 공개된다.
- `#55` 같은 번호는 GitHub 이슈·PR이다. 이전 VM 구조의 계획 기록은 `docs/plan/deploy-prep/`에 있다.

## 0. 개요

### 구성도

```text
                       15분마다 workflow_dispatch(Worker Cron Trigger, UTC 7·22·37·52분)
        ┌───────────────────────────────────────────────────────────────┐
        ▼                                                               │
GitHub Actions refresh.yml ── python batch.py ──▶ R2 버킷 ◀── 읽기 ── Worker war-risk-api ◀── 브라우저 ◀── Vercel(frontend/)
                                                  ├ state/           배치 상태(data/·out/)
                                                  ├ api/             응답 JSON
                                                  ├ manifest.json    파일별 sha256·mtime
                                                  └ backup/<날짜>/    하루 1회 백업(7개)
```

### 구성 요소

| 무엇 | 어디 | 파일 |
|---|---|---|
| 15분 배치 | GitHub Actions `refresh` | `.github/workflows/refresh.yml`, `batch.py` |
| 저장소 | Cloudflare R2 버킷 하나(이름은 시크릿 `R2_BUCKET`) | |
| API | Cloudflare Worker `war-risk-api` | `worker/wrangler.jsonc`, `worker/src/index.ts` |
| Worker 배포 | GitHub Actions `worker` | `.github/workflows/worker.yml` |
| 화면 | Vercel 프로젝트 `war-risk-index` | `frontend/` |

| 주소 | |
|---|---|
| API | `https://war-risk-api.war-risk-api.workers.dev` |
| 화면 | `https://war-risk-index.vercel.app` |
| 가동 확인 | `https://war-risk-api.war-risk-api.workers.dev/api/health` |

## 1. 처음 한 번: 계정·토큰·시크릿

이미 끝난 일이다(2026-11). 토큰을 다시 만들거나 버킷을 옮길 때 이 순서를 따른다.

### 1.1 R2 버킷과 R2 토큰

1. Cloudflare 대시보드 → R2 → 버킷 만들기. 이름은 공개 저장소에 남기지 않는다.
2. R2 → API 토큰 관리 → 토큰 만들기: 권한 "객체 읽기 및 쓰기", 대상은 이 버킷만.
3. 만든 화면에서 세 값을 받아 둔다. 다시 볼 수 없다.
   - 액세스 키 ID → `AWS_ACCESS_KEY_ID`
   - 비밀 액세스 키 → `AWS_SECRET_ACCESS_KEY`
   - S3 API 엔드포인트(`https://<계정 ID>.r2.cloudflarestorage.com`) → `R2_ENDPOINT_URL`

### 1.2 Worker 배포 토큰

- Cloudflare → 내 프로필 → API 토큰 → "Cloudflare Workers 편집" 템플릿으로 만든다 → `CLOUDFLARE_API_TOKEN`
- 계정 ID(대시보드 오른쪽, 또는 위 엔드포인트의 앞부분) → `CLOUDFLARE_ACCOUNT_ID`

### 1.3 GitHub 시크릿

저장소 → Settings → Secrets and variables → Actions → New repository secret.

| 시크릿 | 쓰는 곳 | 값 |
|---|---|---|
| `R2_ENDPOINT_URL` | refresh | 1.1의 엔드포인트 |
| `R2_BUCKET` | refresh, worker | 버킷 이름 |
| `AWS_ACCESS_KEY_ID` | refresh | 1.1의 액세스 키 ID |
| `AWS_SECRET_ACCESS_KEY` | refresh | 1.1의 비밀 액세스 키 |
| `DATA_GO_KR_SERVICE_KEY` | refresh | 공공데이터포털 인코딩 키(여행경보·재외공관·대피시설) |
| `CLOUDFLARE_API_TOKEN` | worker | 1.2의 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | worker | 1.2의 계정 ID |

### 1.4 Worker 시크릿: 갱신 워크플로 부르기 토큰

GitHub 예약 실행(schedule)은 대부분 빠진다(#52). 그래서 Worker의 Cron Trigger가 15분마다 `refresh.yml`을 workflow_dispatch로 부른다. 그 토큰이 `GITHUB_DISPATCH_TOKEN`이다.

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
   - 저장소: 이 저장소만
   - 권한: Actions "Read and write"
   - 만료일: 정하고 달력에 적어 둔다. **만료되면 15분 갱신이 멈춘다.**
2. 토큰을 Worker에 넣는다. 입력한 값은 화면에 남지 않는다.

   ```powershell
   cd worker
   npx wrangler login   # 처음 한 번. 브라우저에서 Cloudflare 로그인
   npx wrangler secret put GITHUB_DISPATCH_TOKEN
   cd ..
   ```

3. 확인: 다음 7·22·37·52분(UTC)이 지난 뒤 `workflow_dispatch` 실행이 하나 생긴다.

   ```powershell
   gh run list --workflow refresh.yml --limit 3
   ```

### 1.5 로컬 .env

첫 업로드·복원·리허설은 로컬에서 R2에 직접 붙는다. 루트 `.env`(커밋하지 않음)에 1.1·1.3의 값을 같은 이름으로 넣는다. `batch.py`는 `.env`를 읽는다.

aws CLI로 R2에 붙을 때는 아래를 먼저 실행한다. 6절 명령은 이 변수를 쓴다.

```powershell
Get-Content .env | Where-Object { $_ -match '^(R2_ENDPOINT_URL|R2_BUCKET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)=' } |
  ForEach-Object { $name, $value = $_ -split '=', 2; Set-Item "env:$name" $value.Trim() }
$env:AWS_REQUEST_CHECKSUM_CALCULATION = "when_required"
$env:AWS_RESPONSE_CHECKSUM_VALIDATION = "when_required"
$R2 = @("--endpoint-url", $env:R2_ENDPOINT_URL, "--region", "auto")
$B = "s3://$env:R2_BUCKET"
```

## 2. 첫 업로드

이미 끝난 일이다(2026-11, #51). 빈 버킷에서 다시 시작할 때만 한다. 로컬 `data/`·`out/`이 최신이어야 한다.

```powershell
.venv\Scripts\python.exe -c "import batch; batch.upload(batch.ROOT, {}, include_api=False)"   # state/ 와 manifest.json
.venv\Scripts\python.exe batch.py   # api/ 를 만들어 올린다. 기대: 끝에 "배치 끝: …초"
curl.exe -s https://war-risk-api.war-risk-api.workers.dev/api/health   # 기대: 200 본문
```

## 3. Worker 배포·되돌리기

- **자동**: `worker/` 아래가 바뀌어 main에 머지되면 `worker` 워크플로가 테스트를 돌리고 배포한다.
- **수동**: `gh workflow run worker.yml --ref main`
- **허용 출처(CORS)**: `worker/wrangler.jsonc`의 `vars.CORS_ORIGINS`. 쉼표로 구분하고 공백은 넣지 않는다. 화면 주소를 바꾸면 여기도 바꾼다.
- **되돌리기**: 이전 버전으로 바로 돌린다. 그다음 main도 되돌리는 PR을 머지한다. 그러지 않으면 다음 자동 배포가 문제 코드를 다시 올린다.

  ```powershell
  cd worker
  npx wrangler deployments list   # 최근 배포와 버전 ID
  npx wrangler rollback <버전 ID>
  cd ..
  ```

- **실시간 로그**: Workers Logs는 꺼 두었다(요청 URL에 대피소 검색 위치가 남기 때문, #54). 볼 때만 `cd worker; npx wrangler tail war-risk-api`로 본다.

## 4. 화면(Vercel)

1. Vercel → Add New → Project → GitHub 저장소 가져오기
   - Root Directory: `frontend`
   - Framework Preset: Next.js(자동)
2. Environment Variables(Production)를 넣는다. 둘 다 끝에 `/`를 붙이지 않는다.
   - `NEXT_PUBLIC_API_BASE_URL` = `https://war-risk-api.war-risk-api.workers.dev`
   - `NEXT_PUBLIC_SITE_URL` = `https://war-risk-index.vercel.app`
3. **`NEXT_PUBLIC_` 값은 빌드할 때 코드에 박힌다.** 값을 넣거나 바꾼 뒤에는 Deployments → 최신 배포 `⋯` → Redeploy(Use existing Build Cache 끔)로 다시 빌드한다.
   - 빠졌을 때의 증상: 화면에 "Failed to fetch"가 뜨고, 브라우저 네트워크 탭에 `http://localhost:8000/api/…` 요청이 보인다. canonical·OG 주소도 `http://localhost:3000`이 된다.
4. main에 머지하면 Vercel이 운영 배포를 한다. 다른 브랜치는 미리보기 배포다. 미리보기 주소는 CORS에 없어서 API 호출이 막힌다. 화면 확인은 운영 주소로 한다.
5. **되돌리기**: Deployments → 이전 배포 `⋯` → Promote to Production
6. 주소(도메인)를 바꾸면 `NEXT_PUBLIC_SITE_URL`과 Worker `CORS_ORIGINS`(3절)를 함께 바꾼다.

## 5. 15분 갱신

- Worker Cron Trigger가 UTC 7·22·37·52분에 `refresh.yml`을 부른다. GitHub 예약 실행은 같은 시각의 예비다.
- 실행 하나는 보통 1~2분이다. 제한은 14분이다(`timeout-minutes`, 최악 계산은 `refresh.yml` 주석).
- 겹치면 앞 실행이 끝날 때까지 기다린다(concurrency, 대기는 하나만 남는다).
- 확인과 수동 실행:

  ```powershell
  gh run list --workflow refresh.yml --limit 5
  gh run view <실행 ID> --log | Select-String "배치 끝|실패|ERROR|대피시설|R2 백업"
  gh workflow run refresh.yml --ref main
  ```

- **실행 기록이 30분 넘게 없을 때**: 아래 둘 중 하나다.
  - **토큰 만료**: 1.4대로 다시 발급해 `npx wrangler secret put GITHUB_DISPATCH_TOKEN`
  - **워크플로가 꺼짐**: 공개 저장소에서 60일 동안 활동이 없으면 GitHub가 예약 실행을 끈다. `gh workflow enable refresh.yml`로 다시 켠다. 꺼진 워크플로를 dispatch로 부를 수 있는지는 확실하지 않으니 둘 다 확인한다.
- **대피시설(행정안전부 API)**
  - 하루 1회 받는다. 러너에서는 쪽당 약 6초라 실행마다 5분씩 받아 `state/data/shelters.partial.json`에 쌓고, 4번쯤(약 1시간)에 끝난다(#65).
  - 로그 `대피시설: N/M건 받음, 다음에 K쪽부터 이어 받음`은 정상 진행이다.
  - 실패하면 1시간 뒤 다시 하고, 받은 쪽은 남는다. 제공 기관 서버가 자주 멈춘다(#64).

## 6. 백업·복원

### 6.1 백업

배치가 R2 올리기를 마친 뒤 하루 1회(KST) `state/`와 `manifest.json`을 `backup/<날짜>/`로 R2 안에서 복사한다. 날짜는 7개만 남긴다(#66). `manifest.json`이 있는 날짜만 다 된 백업이다.

```powershell
aws s3 ls "$B/backup/" @R2   # 날짜 목록
aws s3 ls "$B/backup/<날짜>/manifest.json" @R2   # 기대: 한 줄(다 된 백업)
```

R2 안 복사(버킷 → 버킷 `cp`·`sync`)에는 꼭 `--copy-props none`을 붙인다. 붙이지 않으면 aws CLI가 큰 파일의 태그를 복사하려고 `GetObjectTagging`을 부르는데, R2는 이를 지원하지 않아 실패한다.

### 6.2 리허설(운영 state를 건드리지 않음)

백업 하나를 임시 폴더로 받아 `manifest.json`의 sha256과 대조한다. 월 1회, 그리고 복원 직전에 한다.

```powershell
$D = "<날짜>"   # 예: 2026-11-16
$T = Join-Path $env:TEMP "war-risk-backup-check"
Remove-Item -Recurse -Force $T -ErrorAction SilentlyContinue
aws s3 sync "$B/backup/$D/" $T @R2 --only-show-errors
.venv\Scripts\python.exe batch.py --check-backup $T   # 기대: 백업 대조: 다른 키 0개, 모두 같음
Remove-Item -Recurse -Force $T
```

### 6.3 복원(운영 state를 덮어쓴다)

데이터가 깨졌을 때만 한다. 복원 뒤 그 날짜 이후의 상태는 사라진다. 실시간 GDELT는 다음 실행부터 다시 쌓인다.

```powershell
gh workflow disable refresh.yml   # 갱신을 멈춘다(Worker 의 호출은 실패로 끝난다)
gh run list --workflow refresh.yml --limit 3   # 기대: in_progress·queued 없음. 있으면 끝날 때까지 기다린다
$D = "<날짜>"   # manifest.json 이 있는 날짜. 6.2 리허설을 먼저 한다
aws s3 sync "$B/backup/$D/state/" "$B/state/" --delete --copy-props none @R2
aws s3 cp "$B/backup/$D/manifest.json" "$B/manifest.json" --copy-props none @R2
gh workflow enable refresh.yml
gh workflow run refresh.yml --ref main   # 기대: 성공. api/ 는 이 실행이 다시 만든다
curl.exe -s https://war-risk-api.war-risk-api.workers.dev/api/health
```

## 7. 가동 감시

### 7.1 감시 등록

외부 감시 서비스(무료 요금제)에 HTTP(S) 감시 두 개를 등록한다. 간격은 5분, 알림은 메일이다.

- `https://war-risk-api.war-risk-api.workers.dev/api/health`: 데이터가 오래되면 일부러 503을 준다. 서비스가 멈춘 것뿐 아니라 갱신이 멈춘 것도 알린다.
- `https://war-risk-index.vercel.app/`: 화면

### 7.2 health 읽는 법

```powershell
curl.exe -s https://war-risk-api.war-risk-api.workers.dev/api/health
```

- `live_age_minutes`: 최신 실시간 슬롯부터 지금까지의 분이다. 정상은 약 −11~+20분이고, 60을 넘으면 503이다. GDELT 2.0 슬롯이 실제 발행보다 약 10~11분 늦게 찍혀서 음수도 정상이다.
- `index_age_days`: 오늘(UTC)과 일별 지수 최신 날짜의 차다. 정상은 1~2이고, 3을 넘으면 503이다.
- 값이 `null`이면 그 파일이 없다는 뜻이고 503이다.

### 7.3 알림을 받았을 때

1. health 본문으로 실시간과 일별 중 무엇이 늦었는지 본다(7.2).
2. 갱신 실행 기록을 본다(5절). 실패면 로그의 `실패`·`ERROR`를 찾고, 기록이 없으면 토큰·워크플로를 본다.
3. Worker 오류는 `npx wrangler tail war-risk-api`로 본다(3절). 배포 뒤부터면 되돌린다(3절).
4. 데이터가 깨졌으면(`ParserError` 등) 복원한다(6.3).
5. **월 1회(알림과 별개)**: UCDP 갱신 실패는 health에 잡히지 않는다. 갱신 로그에서 `UCDP 갱신 실패`를 찾는다.

## 8. 비용 확인(월 1회)

| 항목 | 무료 한도 | 추정 사용량(2026-11) |
|---|---|---|
| Workers 요청 | 하루 10만 | 화면 사용량에 따름 |
| Workers CPU | 요청당 10ms | 대부분 1~7ms, 대피소 좌표 검색은 최대 14ms(#54) |
| R2 저장 | 10GB | state 약 0.16GB, 백업 7개 약 1.1GB, api 수십 MB |
| R2 Class A(쓰기·나열) | 월 100만 | 배치 상한 약 30만, 뉴스 약 8만, 백업 약 0.5만 |
| R2 Class B(읽기) | 월 1,000만 | API 요청 하나에 1~6건 |
| GitHub Actions | 공개 저장소는 무료 | 15분마다 1회 |
| Vercel | Hobby 요금제 무료 | |

- 확인하는 곳
  - Cloudflare: Workers & Pages → `war-risk-api` → 지표(요청·CPU 시간), R2 → 버킷 → 지표(Class A·B, 저장 용량)
  - Vercel: Usage
- 대피소 좌표 검색이 CPU 한도를 넘어 1102 오류가 보이면, 계산을 브라우저로 옮긴다(#54에서 미룸).

## 9. 로컬 개발

- R2 없이 로컬 `data/`·`out/`만 갱신한다: `.venv\Scripts\python.exe batch.py --no-sync`
- FastAPI(`backend/app/main.py`)는 로컬 개발과 생성 파일 회귀 기준용이다. 운영에서는 돌지 않고, 데이터를 스스로 갱신하지 않는다.

  ```powershell
  .venv\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000 --loop asyncio:SelectorEventLoop   # Windows 는 --loop 필요(main.py 머리말)
  ```

- 화면: `cd frontend; npm run dev`. API 주소 기본값이 `http://localhost:8000`이다.

# 이번 주 변화 Top 5

## 배경

지금은 나라를 하나씩 눌러야 점수를 알 수 있다. 일반인이 처음 들어왔을 때 "이번 주에 어디가 시끄러워졌나"를 바로 볼 수 있게, 92개국 중 7일 전보다 종합 점수가 많이 오른 나라와 내린 나라를 각각 5개까지 보여준다. 데이터는 이미 `out/country_index.csv`에 일별로 있다.

## 범위

- 포함: `/api/countries` 응답에 7일 전 종합 점수 추가, 홈 화면 "이번 주 변화" 영역(위젯 신규)
- 제외: 국가 쌍 Top 5, 기간 선택(7일 고정), 알림

## 동작 정의

- 기준일 D = 그 나라 `country_index.csv`의 최신 `date`. 비교일 = D − 7일(같은 파일의 같은 나라 행).
- 변화량 = `blended(D) − blended(D−7)`. 둘 중 하나라도 `blended`가 비어 있으면 그 나라는 제외한다.
- 오른 나라: 변화량 > 0, 큰 순 최대 5개. 내린 나라: 변화량 < 0, 작은 순 최대 5개. 같으면 국가 코드 오름차순.
- 한쪽 목록이 0개면 그 목록을 숨기고, 둘 다 0개면 영역 전체를 숨긴다.
- 항목 표시: 국가명(`countryName`), 현재 종합 점수(소수 1자리), 변화량(`+12.3` / `−8.0`), 상태 배지(있으면).
- 항목 클릭 시 그 나라가 선택된다(지도 클릭과 같은 동작).
- "전쟁 중" 등급 나라도 포함한다(plan.md Q9 기본안).
- 배치: WorldMap 아래, "주요 분쟁 쌍" 위(Q1).

## 할 일

1. `backend/app/main.py` `list_countries()`에서 나라별 D−7 `blended`를 `latest`와 같은 형태로 내보낸다(예: `week_ago: {date, blended}`, 없으면 `null`). `_csv` 캐시를 그대로 쓴다.
2. `frontend/src/entities/country/model/types.ts`에 필드 타입을 추가한다.
3. `frontend/src/widgets/weekly-movers/`(신규)에 위젯을 만들고 `HomePage.tsx`에 배치한다. 기존 `Panel`, `StatusBadge`를 쓴다.
4. PR 설명에 `out/country_index.csv`로 계산한 기대 Top 5(오른·내린 각 5개)를 Python 한 줄 스크립트 결과로 붙인다.

## 인수 조건

- [ ] `GET /api/countries`의 모든 항목에 `week_ago` 필드가 있고, 값이 있을 때 `week_ago.date`는 `latest.date`보다 정확히 7일 이전이다.
- [ ] 화면의 오른 나라·내린 나라 목록(순서·변화량)이 PR에 첨부한 기대 Top 5와 일치한다(변화량 소수 1자리 반올림 기준).
- [ ] `blended`가 D 또는 D−7에 비어 있는 나라는 목록에 나오지 않는다(해당 나라 1곳을 PR에 예로 적는다. 없으면 "없음"이라고 적는다).
- [ ] 목록 항목을 클릭하면 요약 영역 제목이 그 나라 이름으로 바뀐다.
- [ ] 백엔드 응답에서 `week_ago`를 모두 `null`로 바꾸면(로컬 임시 수정으로 확인) "이번 주 변화" 영역이 DOM에 없다.
- [ ] 홈 화면 첫 로딩 시 신규 네트워크 요청이 0건이다(기존 `/api/countries` 응답만 사용).
- [ ] `.\.venv\Scripts\python -m compileall -q backend` 오류 0건, uvicorn 기동 후 30초 동안 Traceback 0건이다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 폭 375px·1280px로 확인했고 콘솔 오류 0건이다.

## 영향 파일

- `backend/app/main.py`
- `frontend/src/entities/country/model/types.ts`
- `frontend/src/widgets/weekly-movers/` (신규: `index.ts`, `ui/WeeklyMovers.tsx`)
- `frontend/src/views/home/ui/HomePage.tsx`

## 관련 시안

없음

## 선행 이슈

없음

## 라벨

`enhancement`

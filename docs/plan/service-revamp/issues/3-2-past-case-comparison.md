# 과거 위기 사례와 현재 점수 비교

## 배경

점수만 보면 "142점이 얼마나 높은가"를 감 잡기 어렵다. 과거 실제 위기 직전 점수와 나란히 보여주면 일반인도 크기를 가늠할 수 있다. 데이터는 이미 있다.

- `case_backtest.py`의 `CASES`: 개전 5건 + 대조군(위기였지만 전쟁 없음) 6건, 각 T-0 날짜와 GDELT 쌍
- `out/index_v1.csv`: 7개 국가 쌍 2014-04-15부터 일별 점수. 예: 러시아–우크라이나 2022-02-23 `weekly` 142.3
- `FORMULA_v1.md` 검증 표: 개전 직전 주간 점수(러우 2022 142, 이란 2025 60, 하마스 2023 35 등)

검증 결과 점수로 개전 여부를 구분하지 못하므로(개전 2/5, 대조군 3/6이 100점 이상), **개전 사례만 골라 보여주면 예측처럼 보인다.** 대조군을 반드시 함께 보여준다.

## 범위

- 포함: 사례 목록 API(신규), 국가 쌍 선택 시 "과거 위기 때 점수" 영역(위젯 신규)
- 제외: 국가 단위 비교(plan.md Q10), 24시간 점수 비교, 새 사례 추가, 사례 차트

## 동작 정의

- 비교 점수는 양쪽 모두 **일별 뉴스 집계 7일 점수(`weekly`)**를 쓴다. 2022년에는 15분 집계(`v2_weekly`, 2026-05-15 시작)가 없어 종합 점수로 비교하면 기준이 달라진다.
- 사례 점수 = T-0 전날(T-1)의 `weekly`. 사례 쌍이 여러 개면 최댓값(`case_backtest.py`와 같은 규칙).
  - `CASES`의 `USA-IRN`·`USA-PRK`·`USA-CHN`은 `out/index_v1.csv`에 없는 GDELT 쌍이라 파일에 있는 쌍만 쓰게 된다. 2026-11-09에 이 방식으로 계산한 11건 모두 `out/case_backtest.csv`의 `7일 T-1`과 차이 1.0 이하였다(예: 러우 2022 142.3, 이란 2025 60.0, 하마스 2023 35.2).
- 현재 점수 = 선택한 국가 쌍의 최신 `weekly`. 값이 없으면 영역 전체를 숨긴다.
- 표시: 사례 11건을 점수 내림차순으로, 각 항목에 사례 이름, T-0 날짜, 점수, "개전"/"전쟁 없음" 표시. 현재 점수를 같은 막대(또는 목록) 위에 "지금" 표시로 끼워 넣는다. 선택한 쌍과 같은 쌍의 사례는 강조한다.
- 고정 안내 문구: "과거 11건 중 개전 5건, 전쟁 없이 지나간 위기 6건입니다. 점수만으로는 전쟁이 날지 구분할 수 없었습니다."
- 배치: 국가 쌍을 선택했을 때 그리드 아래(Q1).

## 할 일

1. `backend/app/main.py`에 `GET /api/cases`를 추가한다. `case_backtest.CASES`와 `out/index_v1.csv`로 `[{name, label, is_war, t0, pairs, score}]`을 반환한다. `label`은 일반인용 이름(예: "러시아–우크라이나 개전 (2022-02-24)", "중국–대만 펠로시 방문 후 훈련 (2022-08-04)")으로, `FORMULA_v1.md` 검증 표 표기를 따른다.
2. `frontend/src/entities/`에 사례 타입·조회 훅을 추가한다(기존 `useFetch` 사용).
3. `frontend/src/widgets/past-cases/`(신규)에 위젯을 만들고 `HomePage.tsx`에서 국가 쌍 선택 시에만 렌더링한다.

## 인수 조건

- [ ] `GET /api/cases`가 11건을 반환하고, 각 `score`가 `out/case_backtest.csv`의 `7일 T-1`과 차이 1.0 이하다(차이가 나면 원인을 PR에 적는다).
- [ ] 러시아–우크라이나 2022 사례의 `score`가 142.3(반올림 142)이다.
- [ ] `is_war`가 `true`인 항목 5건, `false`인 항목 6건이 화면에 모두 표시된다.
- [ ] 화면에 고정 안내 문구가 그대로 표시된다.
- [ ] 국가 쌍 "러시아 · 우크라이나"를 선택하면 "지금" 표시의 점수가 `GET /api/pairs`의 해당 쌍 `latest.weekly`와 같고, 러우 2022·러우 2021 사례가 강조된다.
- [ ] 국가(예: 대한민국)를 선택하면 이 영역이 DOM에 없다.
- [ ] 선택한 쌍의 `latest.weekly`가 `null`이면 영역이 DOM에 없다(응답 임시 수정으로 확인).
- [ ] `.\.venv\Scripts\python -m compileall -q backend` 오류 0건, uvicorn 기동 후 30초 동안 Traceback 0건이다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 폭 375px·1280px로 확인했고 콘솔 오류 0건이다.

## 영향 파일

- `backend/app/main.py`
- `frontend/src/entities/case/` (신규: `index.ts`, `api/use-cases.ts`, `model/types.ts`)
- `frontend/src/widgets/past-cases/` (신규: `index.ts`, `ui/PastCases.tsx`)
- `frontend/src/views/home/ui/HomePage.tsx`
- 참고(수정 없음): `case_backtest.py`, `out/index_v1.csv`, `out/case_backtest.csv`, `FORMULA_v1.md`

## 관련 시안

없음

## 선행 이슈

없음

## 라벨

`enhancement`

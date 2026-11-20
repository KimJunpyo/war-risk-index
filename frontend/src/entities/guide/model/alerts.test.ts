// 이슈 #72 (1-2 민방위 경보 5종 행동요령) 콘텐츠·출처 인수 테스트.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/entities/guide/model/alerts.ts (별칭 import 없는 단일 파일, 같은 폴더 ./checklist.ts 정도만 import)
//   export const CIVIL_ALERTS: {
//     id: "alert" | "air-raid" | "cbr" | "nuclear" | "all-clear"; name: string; when: string; signal: string;
//     siren: boolean; actions: { id: string; text: string }[]; sources: AlertSourceKey[];
//     keyActions: { from: string; text: string; icon: KeyActionIcon }[];  // #101 핵심 행동. 경보마다 정확히 3개, 상세 첫 화면 순서
//   }[]  // 경계·공습·화생방·핵·해제 순서 고정
//   export const ALERT_SOURCES: Record<"mois-alarm" | "mois-actions" | "mois-emergency", { name: string; url: string; checkedAt: string }>
//   (AlertSourceKey 는 ALERT_SOURCES 의 키, checkedAt "YYYY-MM-DD")
//   (keyActions: from 은 같은 경보 actions 의 id 이고 경보 안에서 서로 다름, text 는 자체 문구 공백 포함 30자 이하,
//    icon 은 그림 이름 문자열 유니온 KeyActionIcon. 목록 안에 있는지는 런타임에 볼 수 없어 npx tsc --noEmit 가 본다)
// 문구는 자체 작성이라 특정 문장은 확인하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ALERT_SOURCES, CIVIL_ALERTS } from "./alerts.ts";
import { CHECKLIST } from "./checklist.ts";

const ALERT_IDS = ["alert", "air-raid", "cbr", "nuclear", "all-clear"];
const MIN_ACTIONS = 3;
const MAX_ACTIONS = 8;
const NIGHT_ALERT_IDS = ["alert", "air-raid"]; // 행동요령이 주간·야간으로 나뉜 경보
const NIGHT_PREFIX = "밤에는";
const SIREN_ALERT_IDS = ["air-raid", "nuclear"]; // 국민안전24 '민방위 경보' 기준
const SOURCE_HOSTS = ["safekorea.go.kr", "law.go.kr"]; // 하위 도메인(www. 등) 허용
const KEY_ACTIONS_PER_ALERT = 3; // 경보 상세 첫 화면의 큰 번호 카드 수 (#101)
const MAX_KEY_ACTION_CHARS = 30; // 공백 포함

test("경보 id 는 경계·공습·화생방·핵·해제 순서로 정확히 5개", () => {
  assert.deepEqual(CIVIL_ALERTS.map((a) => a.id), ALERT_IDS);
});

test("각 경보의 name·when·signal 은 비어 있지 않고, 행동은 3~8개이며 각 행동은 비어 있지 않은 id·text", () => {
  for (const a of CIVIL_ALERTS) {
    for (const key of ["name", "when", "signal"] as const) {
      assert.ok(typeof a[key] === "string" && a[key].trim(), `${a.id}: 빈 ${key}`);
    }
    const n = a.actions.length;
    assert.ok(n >= MIN_ACTIONS && n <= MAX_ACTIONS, `${a.id}: 행동 ${n}개 (${MIN_ACTIONS}~${MAX_ACTIONS}개여야 함)`);
    for (const it of a.actions) {
      assert.ok(typeof it.id === "string" && it.id.trim(), `${a.id}: 빈 행동 id`);
      assert.ok(typeof it.text === "string" && it.text.trim(), `${a.id}: 빈 행동 text`);
    }
  }
});

test('경계·공습은 밤에 할 일을 "밤에는 …"으로 시작하는 행동으로 1개 이상 둔다', () => {
  for (const id of NIGHT_ALERT_IDS) {
    const alert = CIVIL_ALERTS.find((a) => a.id === id);
    assert.ok(alert, `${id} 경보 없음`);
    assert.ok(alert.actions.some((it) => it.text.startsWith(NIGHT_PREFIX)), `${id}: "${NIGHT_PREFIX}"로 시작하는 행동 없음`);
  }
});

test("행동 id 는 전체 경보에서 유일하고 체크리스트(CHECKLIST) id 와 겹치지 않는다", () => {
  const ids = CIVIL_ALERTS.flatMap((a) => a.actions.map((it) => it.id));
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], "경보 사이 중복 id");
  const checklistIds = new Set(Object.values(CHECKLIST).flat().map((it) => it.id));
  assert.deepEqual(ids.filter((id) => checklistIds.has(id)), [], "체크리스트와 겹치는 id");
});

test('사이렌은 공습·핵만 true, signal 에 "사이렌"이 든 경보는 siren 이 true 인 경보뿐', () => {
  for (const a of CIVIL_ALERTS) assert.equal(typeof a.siren, "boolean", `${a.id}: siren 이 boolean 아님`);
  assert.deepEqual(CIVIL_ALERTS.filter((a) => a.siren).map((a) => a.id).sort(), [...SIREN_ALERT_IDS].sort());
  // 사이렌 없는 경보는 "사이렌 없음" 같은 부정문으로도 signal 에 '사이렌'을 쓰지 않는다
  assert.deepEqual(CIVIL_ALERTS.filter((a) => a.signal.includes("사이렌") && !a.siren).map((a) => a.id), []);
});

test("출처: 이름·https 링크·허용 도메인(safekorea.go.kr·law.go.kr)·확인일", () => {
  for (const [key, src] of Object.entries(ALERT_SOURCES)) {
    assert.ok(src.name.trim(), `${key}: 빈 name`);
    assert.match(src.url, /^https:\/\//, `${key}: https 아님`);
    const host = new URL(src.url).hostname;
    assert.ok(SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)), `${key}: 허용 도메인 아님 (${host})`);
    assert.match(src.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${key}: checkedAt 형식`);
  }
});

test("모든 경보가 출처를 1개 이상 가리키고, 그 키가 ALERT_SOURCES 에 있다", () => {
  for (const a of CIVIL_ALERTS) {
    assert.ok(a.sources.length > 0, `${a.id}: 출처 없음`);
    for (const key of a.sources) assert.ok(Object.hasOwn(ALERT_SOURCES, key), `${a.id}: 없는 출처 키 ${key}`);
  }
});

test("alerts.ts 는 별칭(@/) import 없이 단일 파일 (node --test 로 바로 돈다)", () => {
  const source = readFileSync(new URL("./alerts.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:from|import)\s*\(?\s*["']@\//);
});

// 이슈 #101 (경보별 핵심 행동 3가지) 인수 테스트. 어떤 행동을 고를지·문구는 출처 대조로 정하므로 구조와 규칙만 본다.
test("경보 5개 모두 핵심 행동(keyActions)이 정확히 3개", () => {
  for (const a of CIVIL_ALERTS) {
    assert.ok(Array.isArray(a.keyActions), `${a.id}: keyActions 없음`);
    assert.equal(a.keyActions.length, KEY_ACTIONS_PER_ALERT, `${a.id}: 핵심 행동 ${a.keyActions.length}개`);
  }
});

test("핵심 행동의 from 은 같은 경보 actions 의 id 중 하나이고, 한 경보 안에서 서로 다르다", () => {
  for (const a of CIVIL_ALERTS) {
    const actionIds = new Set(a.actions.map((it) => it.id));
    const froms = a.keyActions.map((k) => k.from);
    for (const from of froms) assert.ok(actionIds.has(from), `${a.id}: 같은 경보 actions 에 없는 from ${from}`);
    assert.equal(new Set(froms).size, froms.length, `${a.id}: 겹치는 from (${froms.join(", ")})`);
  }
});

test("핵심 행동의 text 는 비어 있지 않고 공백 포함 30자 이하", () => {
  for (const a of CIVIL_ALERTS) {
    for (const k of a.keyActions) {
      assert.ok(typeof k.text === "string" && k.text.trim(), `${a.id}/${k.from}: 빈 text`);
      const n = [...k.text].length; // 코드 포인트 단위로 센다(한글 음절·가운뎃점·공백 모두 1자)
      assert.ok(n <= MAX_KEY_ACTION_CHARS, `${a.id}/${k.from}: ${n}자 (공백 포함 ${MAX_KEY_ACTION_CHARS}자 이하여야 함) "${k.text}"`);
    }
  }
});

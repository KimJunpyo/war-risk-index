// 이슈 #3 (2-1 국방 뉴스 제목 필터) 제목 매칭 인수 테스트.
// 실행(저장소 루트): node --test frontend/src/**/*.test.ts  (Node 24 타입 스트리핑, 별칭 import 불가)
import assert from "node:assert/strict";
import { test } from "node:test";

import { titleMentions } from "./news-match.ts";

// 별칭 표 초안 + Intl 한국어·영어 이름을 합친 형태
const KP = ["북한", "조선민주주의인민공화국", "North Korea"];
const KR = ["대한민국", "한국", "South Korea"];
const UA = ["우크라이나", "Ukraine"];

const cases: { title: string; keywords: string[]; expected: boolean; why: string }[] = [
  { title: "North Korea fires missile", keywords: KP, expected: true, why: "영문 이름 포함" },
  { title: "north korea fires missile toward East Sea", keywords: KP, expected: true, why: "대소문자 무시" },
  { title: "NORTH KOREA launches ICBM - Reuters", keywords: KP, expected: true, why: "대문자 + 언론사명" },
  { title: "북한, 동해상으로 탄도미사일 발사 - 연합뉴스", keywords: KP, expected: true, why: "한국어 별칭" },
  { title: "OO 국방부 발표 - Korea Herald", keywords: KR, expected: false, why: "언론사명에만 Korea" },
  { title: "국방부 정례 브리핑 - 북한전문매체", keywords: KP, expected: false, why: "언론사명에만 한국어 이름" },
  { title: "러시아 국방부, 신형 미사일 시험 - 한국일보", keywords: KR, expected: false, why: "언론사명의 '한국' 제외" },
  { title: "이스라엘, 가자지구 공습 재개", keywords: KP, expected: false, why: "다른 나라 기사" },
  { title: "Ukraine says drones hit refinery - Kyiv Post - Europe edition", keywords: UA, expected: true, why: "마지막 ' - ' 뒤만 제거" },
  { title: "Defence talks - Ukraine Today", keywords: UA, expected: false, why: "마지막 ' - ' 뒤 언론사명 제거" },
  { title: "우크라이나-러시아 휴전 협상", keywords: UA, expected: true, why: "공백 없는 하이픈은 언론사 구분자 아님" },
  { title: "한국군, 연합훈련 시작", keywords: KR, expected: true, why: "키워드 하나만 포함돼도 통과" },
];

for (const c of cases) {
  test(`${c.expected ? "통과" : "탈락"}: ${c.title} (${c.why})`, () => {
    assert.equal(titleMentions(c.title, c.keywords), c.expected);
  });
}

test("키워드 배열이 비면 탈락", () => {
  assert.equal(titleMentions("North Korea fires missile", []), false);
});

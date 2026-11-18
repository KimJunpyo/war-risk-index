import { expect, test } from "@playwright/test";

// 이슈 #71(1-1) 의미 색 토큰의 다크 값 실측. 토큰 클래스와 원래 팔레트 클래스를 붙인 탐침 요소의 계산값(getComputedStyle 문자열)이
// 같은지 본다. 계산값이 같아야 토큰으로 바꿔도 화면이 바뀌지 않는다. 비교 속성은 글자·배경·테두리(위)·밑줄 색.
// 다크 값만 잰다(시스템 설정을 다크로 흉내 냄). M4(4-4)에서 라이트 값이 들어오면 이 검사는 다크 쪽 검사로 남는다.
// Tailwind v4 는 소스에 글자 그대로 있는 클래스만 만들어서 클래스 이름을 조립하지 않고 전체를 적는다.
// 이 파일도 스캔 대상이라(기준 폴더 frontend, .gitignore 경로 제외) 여기 적은 클래스는 개발·배포 CSS 에 함께 들어간다.
// 소스 쪽 계약(토큰 정의·Panel·SegmentedControl 팔레트 색 0건)은 tests/test_m13_tokens.py

// [토큰 클래스, 원래 클래스]. 두 목록은 같은 순서(글자·배경·테두리·밑줄)로 쓴다.
// 이슈 표 24개 + track(SegmentedControl 바탕)·selected(선택된 버튼 바탕)·error(StatusText 오류 문구).
// tests/test_m13_tokens.py TOKENS 와 같은 목록
const TOKENS: [token: string, original: string][] = [
  ["text-page bg-page border-page decoration-page", "text-background bg-background border-background decoration-background"],
  ["text-fg-strong bg-fg-strong border-fg-strong decoration-fg-strong", "text-white bg-white border-white decoration-white"],
  ["text-fg-bright bg-fg-bright border-fg-bright decoration-fg-bright", "text-neutral-100 bg-neutral-100 border-neutral-100 decoration-neutral-100"],
  ["text-fg bg-fg border-fg decoration-fg", "text-neutral-200 bg-neutral-200 border-neutral-200 decoration-neutral-200"],
  ["text-fg-soft bg-fg-soft border-fg-soft decoration-fg-soft", "text-neutral-300 bg-neutral-300 border-neutral-300 decoration-neutral-300"],
  ["text-fg-muted bg-fg-muted border-fg-muted decoration-fg-muted", "text-neutral-400 bg-neutral-400 border-neutral-400 decoration-neutral-400"],
  ["text-link-line bg-link-line border-link-line decoration-link-line", "text-neutral-500 bg-neutral-500 border-neutral-500 decoration-neutral-500"],
  ["text-surface bg-surface border-surface decoration-surface", "text-white/[0.03] bg-white/[0.03] border-white/[0.03] decoration-white/[0.03]"],
  ["text-surface-inner bg-surface-inner border-surface-inner decoration-surface-inner", "text-white/[0.02] bg-white/[0.02] border-white/[0.02] decoration-white/[0.02]"],
  ["text-surface-hover bg-surface-hover border-surface-hover decoration-surface-hover", "text-white/10 bg-white/10 border-white/10 decoration-white/10"],
  ["text-field bg-field border-field decoration-field", "text-neutral-900 bg-neutral-900 border-neutral-900 decoration-neutral-900"],
  ["text-overlay bg-overlay border-overlay decoration-overlay", "text-neutral-950 bg-neutral-950 border-neutral-950 decoration-neutral-950"],
  ["text-line bg-line border-line decoration-line", "text-white/10 bg-white/10 border-white/10 decoration-white/10"],
  ["text-line-strong bg-line-strong border-line-strong decoration-line-strong", "text-white/15 bg-white/15 border-white/15 decoration-white/15"],
  ["text-line-soft bg-line-soft border-line-soft decoration-line-soft", "text-white/5 bg-white/5 border-white/5 decoration-white/5"],
  ["text-danger bg-danger border-danger decoration-danger", "text-rose-300 bg-rose-300 border-rose-300 decoration-rose-300"],
  ["text-warning bg-warning border-warning decoration-warning", "text-amber-300 bg-amber-300 border-amber-300 decoration-amber-300"],
  ["text-success bg-success border-success decoration-success", "text-emerald-300 bg-emerald-300 border-emerald-300 decoration-emerald-300"],
  ["text-info bg-info border-info decoration-info", "text-sky-300 bg-sky-300 border-sky-300 decoration-sky-300"],
  ["text-alert-alert bg-alert-alert border-alert-alert decoration-alert-alert", "text-amber-300 bg-amber-300 border-amber-300 decoration-amber-300"],
  ["text-alert-air-raid bg-alert-air-raid border-alert-air-raid decoration-alert-air-raid", "text-red-300 bg-red-300 border-red-300 decoration-red-300"],
  ["text-alert-cbr bg-alert-cbr border-alert-cbr decoration-alert-cbr", "text-violet-200 bg-violet-200 border-violet-200 decoration-violet-200"],
  ["text-alert-nuclear bg-alert-nuclear border-alert-nuclear decoration-alert-nuclear", "text-fuchsia-300 bg-fuchsia-300 border-fuchsia-300 decoration-fuchsia-300"],
  ["text-alert-all-clear bg-alert-all-clear border-alert-all-clear decoration-alert-all-clear", "text-emerald-300 bg-emerald-300 border-emerald-300 decoration-emerald-300"],
  ["text-track bg-track border-track decoration-track", "text-white/5 bg-white/5 border-white/5 decoration-white/5"],
  ["text-selected bg-selected border-selected decoration-selected", "text-white/15 bg-white/15 border-white/15 decoration-white/15"],
  ["text-error bg-error border-error decoration-error", "text-red-400 bg-red-400 border-red-400 decoration-red-400"],
];
const PROPS = ["color", "background-color", "border-top-color", "text-decoration-color"];
// 탐침을 담는 상자의 글자 색. 어떤 토큰 값과도 달라서 클래스 없는 탐침의 글자·테두리·밑줄 색(currentcolor)이 토큰 값과 겹치지 않는다
const CONTROL_COLOR = "rgb(1, 2, 3)";

/** 브라우저 안에서 실행: 클래스 하나만 붙인 탐침마다 props 계산값을 읽는다. control 은 클래스 없는 탐침.
 *  글자 색 클래스를 테두리·밑줄 클래스와 한 요소에 두면, 테두리·밑줄 토큰이 없어도 currentcolor(글자 색)로 같게 나와 헛통과한다 */
function computedInPage({ classes, props, color }: { classes: string[]; props: string[]; color: string }) {
  const box = document.body.appendChild(document.createElement("div"));
  box.style.color = color;
  const read = (cls: string) => {
    const el = box.appendChild(document.createElement("span"));
    el.className = cls;
    el.textContent = "probe";
    const cs = getComputedStyle(el);
    return props.map((p) => cs.getPropertyValue(p));
  };
  const out = { control: read(""), values: Object.fromEntries(classes.map((c) => [c, read(c)])) };
  box.remove();
  return out;
}

// M4 에서 시스템 설정(prefers-color-scheme)을 따르게 되므로 다크를 흉내 내 다크 값을 잰다
test.use({ colorScheme: "dark" });

test("토큰 클래스의 다크 계산값 = 원래 팔레트 클래스(글자·배경·테두리·밑줄 색)", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").waitFor();
  const pairs = TOKENS.flatMap(([token, original]) => {
    const o = original.split(" ");
    return token.split(" ").map((t, i) => [t, o[i]]);
  });
  const { control, values } = await page.evaluate(computedInPage, { classes: pairs.flat(), props: PROPS, color: CONTROL_COLOR });
  // 계산값이 클래스 없는 탐침과 모두 같으면 적용되지 않은 클래스(CSS 에 없거나 변수 값이 무효)
  const unapplied = (cls: string) => values[cls].every((v, i) => v === control[i]);
  // 헛통과 막기: 원래 클래스까지 없으면 토큰 클래스가 없을 때 둘 다 기본값이라 같게 나온다
  expect(pairs.map(([, o]) => o).filter(unapplied), "적용되지 않은 원래 클래스(Tailwind 가 이 파일을 스캔하는지 확인)").toEqual([]);
  expect.soft(pairs.map(([t]) => t).filter(unapplied), "적용되지 않은 토큰 클래스(CSS 에 없거나 변수 값이 무효)").toEqual([]);
  const diffs = pairs.filter(([t]) => !unapplied(t)).flatMap(([t, o]) => PROPS.flatMap((p, i) =>
    values[t][i] === values[o][i] ? [] : [`${t} / ${o} · ${p}: ${values[t][i]} ≠ ${values[o][i]}`]));
  expect.soft(diffs, "계산값이 다른 쌍(토큰 / 원래 · 속성: 토큰 값 ≠ 원래 값)").toEqual([]);
});

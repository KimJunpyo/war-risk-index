import { defineConfig, devices } from "@playwright/test";
import { BACKEND_SERVER, BACKEND_URL, OFFLINE_SPEC } from "./playwright.config";

// 오프라인 spec 전용 설정(이슈 #80). 서비스 워커는 프로덕션에서만 등록하고, Playwright 의 서비스 워커 기능은 Chromium 만 지원한다(plan.md 사실 6·Q6).
// 개발 서버(3000)와 포트가 같으면 reuseExistingServer 때문에 서로 엉뚱한 서버를 시험하므로 다른 포트를 쓴다
const PORT = 3100;
const FRONTEND_URL = `http://localhost:${PORT}`;
const BUILD_TIMEOUT_MS = 600_000; // next build(빌드 때 /api/embassies 를 받는다) + next start

export default defineConfig({
  testDir: "./e2e",
  testMatch: OFFLINE_SPEC,
  outputDir: "./test-results/offline",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/offline" }]],
  use: { baseURL: FRONTEND_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    // 빌드가 백엔드를 부르므로 백엔드가 먼저 뜬다(webServer 는 순서대로 준비된다)
    BACKEND_SERVER,
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      url: FRONTEND_URL,
      // 지난 빌드를 시험하지 않게 늘 새로 빌드한다. 이 포트에 무엇이 떠 있으면 시작하지 않고 멈춘다
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_BASE_URL: BACKEND_URL },
      timeout: BUILD_TIMEOUT_MS,
    },
  ],
});

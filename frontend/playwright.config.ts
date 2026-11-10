import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL = "http://localhost:3000";
const BACKEND_URL = "http://localhost:8000";

// Chrome은 앱 안 브라우저로 확인하므로 Firefox·WebKit(Safari 엔진)만 돌린다.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: FRONTEND_URL },
  projects: [
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  // 이미 떠 있는 개발 서버를 그대로 쓰고, 없을 때만 띄운다.
  webServer: [
    {
      // Windows 기본(Proactor) 루프는 연결 수락 중 클라이언트가 끊기면(WinError 64) 서버 소켓을 닫아
      // 이후 연결이 모두 거부되므로 Selector 루프로 띄운다
      command: ".venv\\Scripts\\python.exe -m uvicorn backend.app.main:app --port 8000 --loop asyncio:SelectorEventLoop",
      cwd: "..",
      // 테스트용으로 띄운 백엔드는 GDELT 실시간 수집·데이터 파일 갱신을 하지 않게 한다
      env: { LIVE_UPDATES: "0" },
      url: `${BACKEND_URL}/api/countries`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

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
      command: ".venv\\Scripts\\python.exe -m uvicorn backend.app.main:app --port 8000",
      cwd: "..",
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

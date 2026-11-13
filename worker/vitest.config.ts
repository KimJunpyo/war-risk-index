import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// 테스트는 wrangler.jsonc 의 바인딩(R2 BUCKET 은 로컬 가짜)과 vars 로 workerd 안에서 돈다.
// remoteBindings: false 로 바인딩에 remote 가 붙어도 실제 Cloudflare 자원에 접속하지 않게 한다
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" }, remoteBindings: false })],
});

import {defineConfig} from "@playwright/test";

const testPort = Number(process.env.SHIPPING_BUDDY_TEST_PORT || 3101);
const testUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {baseURL: testUrl, headless: true},
  // Never reuse an arbitrary service on port 3000 (the desktop environment may
  // have another local project there). Tests always start this workspace itself.
  webServer: {command: `node scripts/start-e2e-server.js ${testPort}`, url: testUrl, reuseExistingServer: false},
});

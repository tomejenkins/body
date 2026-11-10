import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./tests/audit",
  fullyParallel: false,
  workers: 1,
  timeout: 240000,
  outputDir: "test-results-audit",
  projects: [{ name: "audit-chromium", use: { ...devices["Desktop Chrome"] } }],
});

// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    headless: true,
  },

  projects: [
    {
      // 4321pai
      name: "user1",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      // sykb
      name: "user2",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user2.json",
      },
    },
  ],
});


// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 300000, // 增加测试超时时间到5分钟
  use: {
    trace: "on-first-retry",
    actionTimeout: 30000, // 增加操作超时时间到30秒
    navigationTimeout: 60000, // 增加导航超时时间到60秒
  },

  projects: [
    {
      // 4321pai
      name: "user1",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      // sykb
      name: "user2",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        storageState: "playwright/.auth/user2.json",
      },
    },
    {
      // baidu
      name: "baidu",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        // storageState: "playwright/.auth/baidu.json",
      },
    },
  ],
});


// @ts-check
import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // 执行登录操作
  await page.goto("https://www.syp4321.com/");
  await page.fill("#ls_username", "jadram");
  await page.fill("#ls_password", "123123++");
  await page.click(".pn");

  await page
    .waitForSelector('a:has-text("Jadram")', { timeout: 5000 })
    .then(async () => {
      console.log('找到了包含 "Jadram" 的段落');
      // 获取保存的登录状态
      await page.context().storageState({ path: authFile });
      const storageState = await page.context().storageState();
      console.log("保存的登录状态：", storageState);
    })
    .catch(() => {
      console.log('未找到包含 "Jadram" 的段落');
    });
});

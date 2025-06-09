// @ts-check
import { test, expect } from "@playwright/test";
const authFile = "playwright/.auth/baidu.json";

// 百度网盘登录设置
test("baiduZip", async ({ page }) => {
  try {
    console.log("=== 开始百度网盘自动解压任务 ===");

    // 设置 Cookie
    console.log("📝 正在设置登录Cookie...");
    const cookies = [
      {
        name: "BDUSS",
        value:
          "HMyVVZSUU1oamR3NEhPRDFWMGRpVzZJTEpRb2c1d203MHl3ZjZKTTVwUUdIR3BvSVFBQUFBJCQAAAAAAAAAAAEAAAArwHtNZmF2b3JpdGXYvMSwxK0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaPQmgGj0JoO", // 替换为真实值
        domain: ".baidu.com",
        path: "/",
        httpOnly: true,
        secure: true,
        expires: -1, // 会话 Cookie
      },
      {
        name: "STOKEN",
        value:
          "cca4bf6960c9d20de51145d19f9d640b7231a5e48c7c1ecb288a729f27e09a10", // 替换为真实值
        domain: ".baidu.com",
        path: "/",
        httpOnly: false,
        secure: true,
        expires: -1,
      },
      // 可添加更多必要的 Cookie 字段（如 BAIDUID、PTOKEN 等）
    ];

    await page.context().addCookies(cookies);
    console.log("✅ Cookie设置完成，包含BDUSS和STOKEN");

    console.log("🌐 正在访问百度网盘首页...");
    await page.goto("https://pan.baidu.com");
    console.log("✅ 页面加载完成");

    // 检查是否已经登录
    const isLoggedIn = (await page.locator(".nd-user-info").count()) > 0;

    if (!isLoggedIn) {
      console.log("需要登录百度网盘");

      // 点击登录按钮
      await page.getByRole("button", { name: "去登录" }).click();
      await page.getByText("直接登录", { exact: true }).click();

      // 等待登录成功的标志
      await page.waitForSelector(".nd-user-info", { timeout: 60000 });

      // 保存登录状态
      await page.context().storageState({ path: authFile });
      console.log("登录状态已保存到:", authFile);
    } else {
      console.log("已经处于登录状态");
    }

    await page.goto(
      "https://pan.baidu.com/disk/main#/index?category=all&path=%2Ftest%2Fsykb_new_part2"
    );

    const isOpen =
      (await page.locator(".wp-s-aside-nav-bubble-close").count()) > 0;
    if (isOpen) {
      await page.locator(".wp-s-aside-nav-bubble-close").click();
    }

    const tableBody = await page.locator(".wp-s-pan-table__body-table tbody");
    // 获取表格中所有的行
    const rows = await tableBody.locator("tr").all();
    // 遍历每一行
    for (const row of rows) {
      // 获取行中的所有单元格
      const a = await row.locator("a.wp-s-pan-list__file-name-title-text");
      await a.click();
      await page.waitForTimeout(1000);

      await page.getByRole("button", { name: "解压到" }).click();
      await page.getByTitle("中转站").click();
      await page.getByRole("button", { name: "操作到此" }).click();
      await page.waitForTimeout(1000);
      //   点击浏览器上部中间一下
      await page.mouse.click(300, 300);
    }
  } catch (error) {
    console.error(`百度网盘登录设置时出错: ${error.message}`);
    throw error;
  }
});

// 在测试结束后关闭数据库连接
test.afterAll(async () => {
  //   await closeDatabase();
});

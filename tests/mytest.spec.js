// @ts-check
import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";

const authFile = "playwright/.auth/user.json";

const baiduLinks = [];
const regex = /提取码[:：]?\s*([a-zA-Z0-9]+)/gi;

// 配置项：是否执行VIP会员操作
const enableVipOperation = process.env.ENABLE_VIP_OPERATION !== "false"; // 默认为true

// 数据库配置
const dbConfig = {
  host: "117.72.60.94",
  port: 3306,
  user: "root",
  password: "JIADAOMING0119",
  database: "scraper_db",
};

// 创建数据库连接
let connection;

// 初始化数据库连接和表
async function initDatabase() {
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log("数据库连接成功");

    // 创建kb表（如果不存在）
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS kb (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        baidu_link_text TEXT,
        baidu_link_href VARCHAR(500) UNIQUE,
        baidu_code VARCHAR(50),
        link_with_code TEXT,
        download_info TEXT,
        status TINYINT DEFAULT 1,
        hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createTableQuery);
    console.log("kb表创建成功或已存在");
  } catch (error) {
    console.error("数据库初始化失败:", error);
  }
}

// 插入数据到数据库（避免重复）
async function insertToDatabase(data) {
  if (!connection) {
    console.error("数据库连接未建立");
    return;
  }

  try {
    const { title, baiduLinkText, baiduLinkHref, baiduCode } = data;

    // 生成下载信息格式
    const downloadInfo = `下载链接: ${baiduLinkHref}  提取码: ${baiduCode}`;
    const linkWithCode = `${baiduLinkText}?pwd=${baiduCode}`;

    // 检查是否已存在相同的链接
    const [existing] = await connection.execute(
      "SELECT id FROM kb WHERE baidu_link_href = ?",
      [baiduLinkHref]
    );

    if (existing.length > 0) {
      console.log(`链接已存在，跳过插入: ${baiduLinkHref}`);
      return;
    }

    // 插入新数据
    const insertQuery = `
      INSERT INTO kb (title, baidu_link_text, baidu_link_href, baidu_code, link_with_code, download_info)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.execute(insertQuery, [
      title,
      baiduLinkText,
      baiduLinkHref,
      baiduCode,
      linkWithCode,
      downloadInfo,
    ]);

    console.log(`数据插入成功，ID: ${result.insertId}`);
    console.log(`下载信息: ${downloadInfo}`);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      console.log(`重复链接，跳过插入: ${data.baiduLinkHref}`);
    } else {
      console.error("插入数据失败:", error);
    }
  }
}

// 关闭数据库连接
async function closeDatabase() {
  if (connection) {
    await connection.end();
    console.log("数据库连接已关闭");
  }
}

let tag = false;
let saveCount = 0;

test("authenticate", async ({ page }) => {
  // 初始化数据库
  await initDatabase();

  // 执行登录操作
  await page.goto("https://www.4321syp.com/");

  // 验证是否已登录（根据实际页面调整）
  await expect(page.locator(".vwmy"))
    .toBeVisible()
    .then(async () => {
      console.log("已登录");
      const allModules = [];
      const modules = await page.locator(".fl_tb dl dt a").all();

      if (modules.length === 0) {
        console.log("⚠️ 未找到任何模块，请检查选择器是否正确");
      } else {
        for (const [index, module] of modules.entries()) {
          const moduleName = await module.textContent();
          console.log(`第 ${index + 1} 个模块名称: ${moduleName}`);
          allModules.push(moduleName);
        }
      }
      for (const moduleName of allModules) {
        if (moduleName === "FSS工作室") {
          tag = true;
        }
        if (!tag) {
          continue;
        }
        await gotoModule(page, moduleName);

        // 处理完当前模块后，返回首页
        console.log("模块处理完成，返回首页");
        const indexPage = await page.locator("#mn_forum");
        await indexPage.click();
        await page.waitForLoadState("networkidle");
        console.log("已返回首页，准备处理下一个模块");
      }
      // await gotoModule(page, "咕咕精原创");
      return true; // 如果已登录，直接返回
    })
    .catch(async (e) => {
      await page.fill("#ls_username", "jadram");
      await page.fill("#ls_password", "123123++");
      await page.click(".pn");
      await page
        .waitForSelector('a:has-text("Jadram")', { timeout: 5000 })
        .then(async () => {
          console.log('找到了包含 "Jadram" 的段落');
          await page.context().storageState({ path: authFile });
          const storageState = await page.context().storageState();
          console.log("保存的登录状态：", storageState);
        })
        .catch(() => {
          console.log('未找到包含 "Jadram" 的段落');
        });
    });
});

const gotoModule = async (page, moduleName) => {
  const modulePageLink = page.locator("a").filter({
    hasText: new RegExp(
      `^${moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
    ),
  });
  await modulePageLink.waitFor();
  modulePageLink.click();
  await page.waitForLoadState("networkidle");
  let hasNextPage = true;

  while (hasNextPage) {
    const ul = await page
      .waitForSelector("#waterfall", { timeout: 10000 })
      .catch(() => null);
    const locationTip = page.locator("#ip_notice a.y").first();
    if ((await locationTip.count()) > 0) {
      await locationTip.click();
      await page.waitForLoadState("networkidle");
    }
    if (ul) {
      const lis = await ul.$$("li");

      const pageInfoDom = await page.locator("#fd_page_bottom .pg");
      // 提取文本内容
      const nowPage = await pageInfoDom.locator("strong").textContent();
      for (let i = 0; i < lis.length; i++) {
        const li = lis[i];
        const title = await li.$("h3");
        const titleA = await title.$("a");
        if (title) {
          await titleA.click();
          // 跳转到了新的标签页
          const newPage = await page.waitForEvent("popup");
          await newPage.waitForLoadState("networkidle");

          const name = await newPage.locator("#thread_subject").textContent();
          console.log(`当前分类:${moduleName},当前处理的帖子标题: ${name}`);

          const baiduLink = newPage
            .locator('a:has-text("pan.baidu.com")')
            .first();
          let baiduLinkText = "";
          let baiduLinkHref = "";
          let baiduCode = "";
          // 判断是否找到
          const count = await baiduLink.count();
          if (count > 0) {
            baiduLinkText = await baiduLink.textContent();
            baiduLinkHref = await baiduLink.getAttribute("href");
            console.log("找到百度网盘链接：", baiduLinkText);
          } else {
            console.log("未找到包含 pan.baidu.com 的链接");
          }

          const showhide = await newPage.$(".showhide");
          if (showhide) {
            const text = await showhide.textContent();
            // 使用正则表达式匹配提取码
            const matches = [...text.matchAll(regex)];

            if (matches.length > 0) {
              console.log("找到以下提取码：");
              matches.forEach((match) => {
                baiduCode = match[1];
                console.log("- ", baiduCode);
              });
            }
          } else {
            console.log("未找到提取码");

            if (enableVipOperation) {
              console.log("开始进行VIP会员操作");

              // 等待20秒后再进行下一步操作
              console.log("等待20秒后开始VIP会员操作...");
              await newPage.waitForTimeout(20000);
              console.log("等待完成，开始VIP会员操作");

              // 在这里可以对新的标签页进行操作
              const replys = await newPage.$$(".locked");

              // 遍历所有.locked元素，找到包含"查看本帖下载链接的提取码"的元素
              for (let i = 0; i < replys.length; i++) {
                const reply = replys[i];
                const text = await reply.textContent();
                if (
                  text &&
                  text.includes(
                    "如果您已经开通VIP会员，查看本帖下载链接的提取码请"
                  )
                ) {
                  const a = await reply.$("a");
                  if (a) {
                    await a.click();

                    const modal = newPage.locator("#fwin_reply");
                    await modal.waitFor({ timeout: 10000 });
                    const textarea = await newPage.$("#postmessage");
                    if (textarea) {
                      await textarea.fill("不错，是我喜欢的片子");
                      await newPage.click("#postsubmit");

                      // 等待提交完成后刷新页面
                      await newPage.waitForTimeout(2000);
                      await newPage.reload();
                      await newPage.waitForLoadState("networkidle");

                      // 重新查找百度网盘链接
                      const refreshedBaiduLink = newPage
                        .locator('a:has-text("pan.baidu.com")')
                        .first();

                      const refreshedCount = await refreshedBaiduLink.count();
                      if (refreshedCount > 0) {
                        baiduLinkText = await refreshedBaiduLink.textContent();
                        baiduLinkHref = await refreshedBaiduLink.getAttribute(
                          "href"
                        );
                        console.log("刷新后找到百度网盘链接：", baiduLinkText);
                      }

                      // 重新查找提取码
                      const refreshedShowhide = await newPage.$(".showhide");
                      if (refreshedShowhide) {
                        const refreshedText =
                          await refreshedShowhide.textContent();
                        const refreshedMatches = [
                          ...refreshedText.matchAll(regex),
                        ];

                        if (refreshedMatches.length > 0) {
                          console.log("刷新后找到以下提取码：");
                          refreshedMatches.forEach((match) => {
                            baiduCode = match[1];
                            console.log("- ", baiduCode);
                          });
                        }
                      }
                    } else {
                      console.log("未找到文本框");
                    }
                    break;
                  }
                }
              }
            } else {
              console.log("VIP会员操作已禁用，跳过此步骤");
            }
          }

          if (baiduLinkText && baiduLinkHref && baiduCode) {
            const linkData = {
              title: name,
              baiduLinkText,
              baiduLinkHref,
              baiduCode,
            };

            baiduLinks.push(linkData);
            saveCount++;
            // 插入到数据库
            await insertToDatabase(linkData);
          }

          // 关闭新的标签页
          await newPage.close();
          // 切换回原来的标签页
          await page.bringToFront();
        }
      }

      console.log(`已保存 ${saveCount} 个链接`);

      // 检查是否存在下一页按钮
      const nextBtn = await page.locator("#fd_page_bottom .pg .nxt");
      const nextBtnCount = await nextBtn.count();

      if (nextBtnCount > 0) {
        console.log("找到下一页按钮，点击进入下一页");
        await nextBtn.click();
        await page.waitForLoadState("networkidle");
        console.log("已进入下一页，继续处理");
      } else {
        console.log("没有下一页按钮，处理完成");
        hasNextPage = false;
      }
    } else {
      console.log("未找到#waterfall元素");
      hasNextPage = false;
    }
  }

  // 关闭数据库连接
  // await closeDatabase();
};

// 在测试结束后关闭数据库连接
test.afterAll(async () => {
  await closeDatabase();
});


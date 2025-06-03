// @ts-check
import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";

const authFile = "playwright/.auth/user2.json";

const baiduLinks = [];
const regex = /提取码[:：]?\s*([a-zA-Z0-9]+)/gi;

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
    console.log("开始连接数据库...");
    connection = await mysql.createConnection(dbConfig);
    console.log("数据库连接成功");

    // 创建kb表（如果不存在）
    console.log("开始创建数据表...");
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS sykb (
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
    console.log("sykb表创建成功或已存在");
  } catch (error) {
    console.error("数据库初始化失败:", error.message);
    console.error("数据库配置:", dbConfig);
    throw error;
  }
}

// 插入数据到数据库（避免重复）
async function insertToDatabase(data) {
  if (!connection) {
    console.error("数据库连接未建立");
    return;
  }

  try {
    console.log("开始插入数据到数据库...");
    const { title, baiduLinkText, baiduLinkHref, baiduCode } = data;
    console.log(
      `准备插入数据: 标题=${title}, 链接=${baiduLinkHref}, 提取码=${baiduCode}`
    );

    // 生成下载信息格式
    const downloadInfo = `下载链接: ${baiduLinkHref}  提取码: ${baiduCode}`;
    const linkWithCode = `${baiduLinkText}?pwd=${baiduCode}`;

    // 检查是否已存在相同的链接
    console.log("检查数据是否已存在...");
    const [existing] = await connection.execute(
      "SELECT id FROM sykb WHERE baidu_link_href = ?",
      [baiduLinkHref]
    );

    if (existing.length > 0) {
      console.log(`链接已存在，跳过插入: ${baiduLinkHref}`);
      return;
    }

    // 插入新数据
    console.log("执行数据插入...");
    const insertQuery = `
      INSERT INTO sykb (title, baidu_link_text, baidu_link_href, baidu_code, link_with_code, download_info)
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
      console.log(`重复链接，跳过插入: ${data.baiduLinkText}`);
    } else {
      console.error("插入数据失败:", error.message);
      console.error("插入数据详情:", data);
      console.error("错误堆栈:", error.stack);
    }
  }
}

// 关闭数据库连接
async function closeDatabase() {
  try {
    if (connection) {
      console.log("开始关闭数据库连接...");
      await connection.end();
      console.log("数据库连接已关闭");
    } else {
      console.log("数据库连接不存在，无需关闭");
    }
  } catch (error) {
    console.error("关闭数据库连接时出错:", error.message);
  }
}

let tag = false;
let saveCount = 0;

test("authenticate", async ({ page }) => {
  try {
    // 初始化数据库
    console.log("开始初始化数据库...");
    await initDatabase();
    console.log("数据库初始化完成");

    // 执行登录操作
    console.log("开始访问网站...");
    await page.goto("https://sykb169.org/");
    console.log("网站访问成功");

    // 检查是否已登录
    console.log("检查登录状态...");
    const userElement = await page.locator('a:has-text("Jadram")').first();
    const loginStatus = (await userElement.count()) > 0;
    console.log(`登录状态检查完成，已登录: ${loginStatus}`);

    if (loginStatus) {
      console.log("已登录，直接开始爬取");
      try {
        const userEmoduleslement = await page
          .locator('#category_1 a:has-text("网盘资源(推荐使用)")')
          .first();
        console.log("找到网盘资源链接，准备点击...");
        await userEmoduleslement.click();
        console.log("成功点击网盘资源链接");

        await getDatas(page);
      } catch (error) {
        console.error("点击网盘资源链接时出错:", error.message);
        throw error;
      }
    } else {
      console.log("未登录，开始登录流程");
      try {
        console.log("查找登录按钮...");
        const loginBtn = await page.locator("a.login");
        await loginBtn.click();
        console.log("成功点击登录按钮");

        await page.waitForLoadState("networkidle");
        console.log("登录页面加载完成");

        console.log("填写用户名...");
        const usernameInput = await page
          .locator("input[name='username']")
          .first();
        await usernameInput.fill("jadram");
        console.log("用户名填写完成");

        console.log("填写密码...");
        const passwordInput = await page
          .locator("input[name='password']")
          .first();
        await passwordInput.fill("123123jdm++");
        console.log("密码填写完成");

        console.log("点击登录提交按钮...");
        await page.click(".pn strong");
        console.log("登录提交按钮点击完成");

        // 等待登录成功并保存认证状态
        try {
          console.log("等待登录结果...");
          // 等待页面跳转或登录成功的标志
          await page.waitForTimeout(10000); // 等待页面加载

          // 检查是否有用户名元素（无论是否可见）
          const userElement = await page
            .locator('a:has-text("Jadram")')
            .first();
          const isUserPresent = (await userElement.count()) > 0;

          if (isUserPresent) {
            console.log("登录成功，保存认证状态...");
            await page.context().storageState({ path: authFile });
            console.log("登录状态已保存到:", authFile);
          } else {
            throw new Error("未找到用户标识");
          }
        } catch (e) {
          console.error("登录验证失败:", e.message);
          console.log('登录可能失败，未找到用户名 "Jadram"');
          throw new Error("登录失败: " + e.message);
        }
      } catch (error) {
        console.error("登录流程出错:", error.message);
        throw error;
      }
    }
  } catch (error) {
    console.error("authenticate测试出错:", error.message);
    console.error("错误堆栈:", error.stack);
    throw error;
  }
});

const getDatas = async (page) => {
  try {
    console.log("开始数据爬取流程...");
    let hasNextPage = true;

    try {
      console.log("查找新页面标签...");
      const newPageTag = await page.locator("#atarget");
      if (newPageTag) {
        await newPageTag.click();
        console.log("成功点击新页面标签");
      }
    } catch (error) {
      console.error("点击新页面标签时出错:", error.message);
    }

    try {
      console.log("查找图片模式按钮...");
      const imgMode = await page.locator("a:has-text('图片模式')");
      if (imgMode) {
        await imgMode.click();
        console.log("成功点击图片模式按钮");
      }
    } catch (error) {
      console.error("点击图片模式按钮时出错:", error.message);
    }

    await page.waitForLoadState("domcontentloaded");
    console.log("页面加载完成");

    let currentPage = 1;
    const jumpPage = await page
      .locator("#fd_page_top .pg a")
      .filter({ hasText: /^8$/ });
    if (jumpPage) {
      await jumpPage.click();
      console.log("成功点击跳转到第 8 页");
    }

    while (hasNextPage) {
      try {
        console.log("当前页数", currentPage);

        // 优化后的代码
        console.log("查找页面内容列表...");
        const thList = await page.$$("tbody tr th.new");
        console.log(`找到 ${thList ? thList.length : 0} 个内容项`);

        if (thList && thList.length > 0) {
          for (let i = 0; i < thList.length; i++) {
            try {
              console.log(`处理第 ${i + 1} 个内容项...`);
              const th = thList[i];
              const a = await th.$("a.xst");

              // 先检查元素是否存在，再进行后续操作
              if (a && !page.isClosed()) {
                const title = await a.textContent();
                console.log(`获取到标题: ${title}`);
                console.log("点击链接...");
                await a.click();

                try {
                  // 跳转到了新的标签页
                  console.log("等待新页面打开...");
                  const newPage = await page.waitForEvent("popup");

                  // 检查新页面是否有效
                  if (newPage.isClosed()) {
                    console.log("新页面已关闭，跳过处理");
                    continue;
                  }

                  try {
                    // 使用更短的超时时间，避免长时间等待
                    await newPage.waitForLoadState("domcontentloaded", {
                      timeout: 15000,
                    });
                    console.log("新页面加载完成");
                  } catch (loadError) {
                    console.log(
                      "页面加载超时，尝试继续处理:",
                      loadError.message
                    );
                    // 即使加载超时，也尝试继续处理
                  }

                  // 切换到新的标签页
                  try {
                    await newPage.bringToFront();
                    console.log("切换到新页面");
                  } catch (bringError) {
                    console.log("切换到新页面失败:", bringError.message);
                    // 如果切换失败，跳过当前项目
                    if (!newPage.isClosed()) {
                      await newPage.close();
                    }
                    continue;
                  }

                  const name = title;

                  try {
                    console.log("查找内容区域...");
                    const showhide = await newPage.$(".showhide");

                    if (showhide) {
                      console.log("找到内容区域，开始提取数据...");

                      try {
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
                          baiduLinkHref = baiduLinkText;
                          console.log("找到百度网盘链接：", baiduLinkText);
                        } else {
                          console.log("未找到包含 pan.baidu.com 的链接");
                        }

                        const text = await showhide.textContent();
                        console.log("获取到内容文本，开始提取提取码...");

                        // 使用正则表达式匹配提取码
                        const matches = [...text.matchAll(regex)];

                        if (matches.length > 0) {
                          matches.forEach((match) => {
                            baiduCode = match[1];
                            console.log("提取码：", baiduCode);
                          });
                        } else {
                          console.log("未找到提取码");
                        }

                        if (baiduLinkText && baiduCode) {
                          const linkData = {
                            title: name,
                            baiduLinkText,
                            baiduLinkHref,
                            baiduCode,
                          };

                          baiduLinks.push(linkData);
                          saveCount++;
                          console.log("准备保存到数据库...");
                          // 插入到数据库
                          await insertToDatabase(linkData);
                          console.log("数据保存完成");
                        } else {
                          console.log("数据不完整，跳过保存");
                        }
                      } catch (error) {
                        console.error("提取数据时出错:", error.message);
                      }
                    } else {
                      console.log("未解锁或未找到内容区域");
                    }
                  } catch (error) {
                    console.error("处理页面内容时出错:", error.message);
                  }

                  console.log(
                    `当前保存了 ${saveCount} 个链接，一共执行了${
                      i + (currentPage - 1) * thList.length
                    }次，当前页数为${currentPage}`
                  );

                  try {
                    // 关闭新的标签页
                    console.log("关闭新页面...");
                    if (!newPage.isClosed()) {
                      await newPage.close();
                    }
                    // 切换回原来的标签页，使用较短超时
                    if (!page.isClosed()) {
                      try {
                        await page.bringToFront();
                        console.log("切换回原页面");
                      } catch (bringBackError) {
                        console.log(
                          "切换回原页面超时，等待片刻后继续:",
                          bringBackError.message
                        );
                        // 等待一下再继续
                        await page.waitForTimeout(1000);
                      }
                    }
                  } catch (error) {
                    console.error("关闭页面时出错:", error.message);
                  }
                } catch (error) {
                  console.error(`处理第 ${i + 1} 个链接时出错:`, error.message);
                  // 尝试切换回原页面
                  try {
                    // 检查页面是否仍然有效，使用较短超时
                    if (!page.isClosed()) {
                      try {
                        await page.bringToFront();
                      } catch (bringBackError) {
                        console.log(
                          "切换回原页面超时，继续处理下一项:",
                          bringBackError.message
                        );
                        // 等待一下再继续
                        await page.waitForTimeout(1000);
                      }
                    }
                  } catch (e) {
                    console.error("页面清理失败:", e.message);
                  }
                }
              } else {
                console.log(`第 ${i + 1} 个 th 元素中未找到 a.xst 链接`);
                continue; // 跳过当前循环，处理下一个元素
              }
            } catch (error) {
              console.error(`处理第 ${i + 1} 个内容项时出错:`, error.message);
              // 检查页面状态，如果页面已关闭则退出循环
              if (page.isClosed()) {
                console.log("主页面已关闭，停止处理");
                return;
              }
              continue; // 继续处理下一个元素
            }
          }
        } else {
          console.log("当前页面没有找到内容列表");
        }

        console.log(`第 ${currentPage} 页处理完成，已保存 ${saveCount} 个链接`);

        // 检查是否存在下一页按钮
        try {
          console.log("检查是否有下一页...");
          const nextBtn = await page.locator("#fd_page_top .pg .nxt");
          const nextBtnCount = await nextBtn.count();

          if (nextBtnCount > 0) {
            console.log("找到下一页按钮，点击进入下一页");
            await nextBtn.click();
            await page.waitForLoadState("domcontentloaded");
            console.log("已进入下一页，继续处理");
            currentPage++;
          } else {
            console.log("没有下一页按钮，处理完成");
            hasNextPage = false;
          }
        } catch (error) {
          console.error("检查下一页时出错:", error.message);
          hasNextPage = false;
        }
      } catch (error) {
        console.error(`处理第 ${currentPage} 页时出错:`, error.message);
        hasNextPage = false;
      }
    }

    console.log(`数据爬取完成，总共保存了 ${saveCount} 个链接`);
  } catch (error) {
    console.error("getDatas函数出错:", error.message);
    console.error("错误堆栈:", error.stack);
    throw error;
  }
};

// 在测试结束后关闭数据库连接
test.afterAll(async () => {
  await closeDatabase();
});


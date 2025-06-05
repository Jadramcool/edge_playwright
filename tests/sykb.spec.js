// @ts-check
import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";

const authFile = "playwright/.auth/user2.json";
const MAX_RETRIES = 3; // 最大重试次数

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

// 重试计数器
const retryCounters = {
  totalAttempts: 0,
  successfulAttempts: 0,
  failedAttempts: 0,
};

// 初始化数据库连接和表
async function initDatabase() {
  try {
    console.log("🚀 开始连接数据库...");
    connection = await mysql.createConnection(dbConfig);
    console.log("✅ 数据库连接成功");

    // 创建kb表（如果不存在）
    console.log("🚀 开始创建数据表...");
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
    console.log("✅ sykb表创建成功或已存在");
  } catch (error) {
    console.error("❌ 数据库初始化失败:", error.message);
    console.error("❌ 数据库配置:", dbConfig);
    throw error;
  }
}

let insertCount = 0;
let currentPageInsertCount = 0; // 记录当前页插入数量

// 插入数据到数据库（避免重复）
async function insertToDatabase(data) {
  if (!connection) {
    console.error("❌ 数据库连接未建立");
    return;
  }

  // 检查连接状态，如果连接已关闭则重新连接
  try {
    await connection.ping();
  } catch (pingError) {
    console.log("🔄 数据库连接已断开，尝试重新连接...");
    try {
      await initDatabase();
    } catch (reconnectError) {
      console.error("❌ 重新连接数据库失败:", reconnectError.message);
      return;
    }
  }

  try {
    console.log("📥 开始插入数据到数据库...");
    const { title, baiduLinkText, baiduLinkHref, baiduCode } = data;
    console.log(
      `💡 准备插入数据: 标题=${title}, 链接=${baiduLinkHref}, 提取码=${baiduCode}`
    );

    // 生成下载信息格式
    const downloadInfo = `下载链接: ${baiduLinkHref}  提取码: ${baiduCode}`;
    const linkWithCode = `${baiduLinkText}?pwd=${baiduCode}`;

    // 检查是否已存在相同的链接
    console.log("🔍 检查数据是否已存在...");
    const [existing] = await connection.execute(
      "SELECT id FROM sykb WHERE baidu_link_href = ?",
      [baiduLinkHref]
    );

    if (existing.length > 0) {
      console.warn(`⚠️ 链接已存在，跳过插入: ${baiduLinkHref}`);
      return;
    }

    // 插入新数据
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

    console.log(`✅ 数据插入成功，ID: ${result.insertId}`);
    insertCount++;
    currentPageInsertCount++;
    console.log(`💪 成功插入数据，总插入次数: ${insertCount}`);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      console.log(`⚠️ 重复链接，跳过插入: ${data.baiduLinkText}`);
    } else if (error.message.includes("connection is in closed state")) {
      console.error("❌ 数据库连接已关闭，尝试重新连接并插入数据...");
      try {
        await initDatabase();
        // 重新尝试插入
        await insertToDatabase(data);
      } catch (retryError) {
        console.error("❌ 重新连接并插入数据失败:", retryError.message);
      }
    } else {
      console.error("❌ 插入数据失败:", error.message);
      console.error("❌ 插入数据详情:", data);
      console.error("❌ 错误堆栈:", error.stack);
    }
  }
}

// 关闭数据库连接
async function closeDatabase() {
  try {
    if (connection) {
      console.log("🚪 开始关闭数据库连接...");
      await connection.end();
      connection = null; // 重置连接对象
      console.log("✅ 数据库连接已关闭");
    } else {
      console.log("ℹ️ 数据库连接不存在，无需关闭");
    }
  } catch (error) {
    console.error("❌ 关闭数据库连接时出错:", error.message);
    connection = null; // 即使关闭失败也重置连接对象
  }
}

// 重试包装函数 - 添加总尝试次数统计
async function withRetry(action, description, page, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    retryCounters.totalAttempts++;
    try {
      console.log(
        `[${attempt}/${retries}] ⚙️ 尝试 (总尝试次数: ${retryCounters.totalAttempts}): ${description}`
      );
      const result = await action();
      retryCounters.successfulAttempts++;
      return result;
    } catch (error) {
      if (attempt === retries) {
        retryCounters.failedAttempts++;
        console.error(
          `❌[${attempt}/${retries}] 失败 (总尝试次数: ${retryCounters.totalAttempts}): ${description}`,
          error.message
        );
        throw error;
      }

      console.log(
        `[${attempt}/${retries}] 🔄 失败，将重试 (总尝试次数: ${retryCounters.totalAttempts}): ${description}`,
        error.message
      );

      // 检查页面是否已关闭
      if (page && page.isClosed()) {
        console.error("❌ 页面已关闭，无法重试");
        throw new Error("页面已关闭，无法重试");
      }

      // 指数退避策略
      await page.waitForTimeout(2000 * attempt);
    }
  }
}

let tag = false;
let saveCount = 0;

test("authenticate", async ({ page, context }) => {
  // 添加上下文监听，捕获页面关闭事件
  context.on("page", (newPage) => {
    newPage.on("close", () => {
      console.log(`📌 页面已关闭: ${newPage.url()}`);
    });
  });

  try {
    // 初始化数据库
    console.log("🚀 开始初始化数据库...");
    await initDatabase();
    console.log("✅ 数据库初始化完成");

    // 执行登录操作
    console.log("🌐 开始访问网站...");
    await withRetry(() => page.goto("https://sykb169.org/"), "访问网站", page);
    console.log("✅ 网站访问成功");

    // 检查是否已登录
    console.log("🔍 检查登录状态...");
    const userElement = await page.locator('a:has-text("Jadram")').first();
    const loginStatus = (await userElement.count()) > 0;
    console.log(`✅ 登录状态检查完成，已登录: ${loginStatus}`);

    if (loginStatus) {
      console.log("✅ 已登录，直接开始爬取");
      try {
        const userEmoduleslement = await page
          .locator('#category_1 a:has-text("网盘资源(推荐使用)")')
          .first();
        console.log("🔍 找到网盘资源链接，准备点击...");

        await withRetry(
          () => userEmoduleslement.click(),
          "点击网盘资源链接",
          page
        );
        console.log("✅ 成功点击网盘资源链接");

        await getDatas(page, context, 466); // 传递 context 用于管理多页面
      } catch (error) {
        console.error("❌ 点击网盘资源链接时出错:", error.message);
        throw error;
      }
    } else {
      console.log("ℹ️ 未登录，开始登录流程");
      try {
        console.log("🔍 查找登录按钮...");
        const loginBtn = await page.locator("a.login");

        await withRetry(() => loginBtn.click(), "点击登录按钮", page);
        console.log("✅ 成功点击登录按钮");

        await page.waitForLoadState("networkidle");
        console.log("✅ 登录页面加载完成");

        console.log("📝 填写用户名...");
        const usernameInput = await page
          .locator("input[name='username']")
          .first();

        await withRetry(() => usernameInput.fill("jadram"), "填写用户名", page);
        console.log("✅ 用户名填写完成");

        console.log("📝 填写密码...");
        const passwordInput = await page
          .locator("input[name='password']")
          .first();

        await withRetry(
          () => passwordInput.fill("123123jdm++"),
          "填写密码",
          page
        );
        console.log("✅ 密码填写完成");

        console.log("🚀 点击登录提交按钮...");

        await withRetry(
          () => page.click(".pn strong"),
          "点击登录提交按钮",
          page
        );
        console.log("✅ 登录提交按钮点击完成");

        // 等待登录成功并保存认证状态
        try {
          console.log("🕒 等待登录结果...");
          // 等待页面跳转或登录成功的标志
          await page.waitForTimeout(10000); // 等待页面加载

          // 检查是否有用户名元素（无论是否可见）
          const userElement = await page
            .locator('a:has-text("Jadram")')
            .first();
          const isUserPresent = (await userElement.count()) > 0;

          if (isUserPresent) {
            console.log("🎉 登录成功，保存认证状态...");
            await page.context().storageState({ path: authFile });
            console.log("✅ 登录状态已保存到:", authFile);
          } else {
            throw new Error("未找到用户标识");
          }
        } catch (e) {
          console.error("❌ 登录验证失败:", e.message);
          console.log('⚠️ 登录可能失败，未找到用户名 "Jadram"');
          throw new Error("登录失败: " + e.message);
        }
      } catch (error) {
        console.error("❌ 登录流程出错:", error.message);
        throw error;
      }
    }
  } catch (error) {
    console.error("❌ authenticate测试出错:", error.message);
    console.error("❌ 错误堆栈:", error.stack);
    throw error;
  } finally {
    // 打印重试统计信息
    console.log("=".repeat(50));
    console.log(`📊 重试统计:`);
    console.log(`✅ 总尝试次数: ${retryCounters.totalAttempts}`);
    console.log(`✅ 成功尝试次数: ${retryCounters.successfulAttempts}`);
    console.log(`❌ 失败尝试次数: ${retryCounters.failedAttempts}`);
    console.log("=".repeat(50));
  }
});

const getDatas = async (page, context, startPage = 0) => {
  try {
    console.log("🚀 开始数据爬取流程...");
    let hasNextPage = true;

    try {
      console.log("🔍 查找新页面标签...");
      const newPageTag = await page.locator("#atarget");
      if (newPageTag) {
        await withRetry(() => newPageTag.click(), "点击新页面标签", page);
        console.log("✅ 成功点击新页面标签");
      }
    } catch (error) {
      console.error("❌ 点击新页面标签时出错:", error.message);
    }

    try {
      console.log("🔍 查找图片模式按钮...");
      const imgMode = await page.locator("a:has-text('图片模式')");
      if (imgMode) {
        await withRetry(() => imgMode.click(), "点击图片模式按钮", page);
        console.log("✅ 成功点击图片模式按钮");
      }
    } catch (error) {
      console.error("❌ 点击图片模式按钮时出错:", error.message);
    }

    await page.waitForLoadState("domcontentloaded");
    console.log("✅ 页面加载完成");

    let currentPage = 1;
    if (startPage > 0) {
      await page.goto(
        "https://sykb169.org/forum.php?mod=forumdisplay&fid=2&page=" + startPage
      );
      await page.waitForLoadState("domcontentloaded");
      console.log(`✅ 成功点击跳转到第 ${startPage} 页`);
      currentPage = startPage;
    }

    // const jumpPage = await page
    //   .locator("#fd_page_top .pg a")
    //   .filter({ hasText: /^8$/ });
    // if (jumpPage) {
    //   await withRetry(() => jumpPage.click(), "点击跳转到第8页", page);
    //   console.log("✅ 成功点击跳转到第 8 页");
    // }

    while (hasNextPage) {
      try {
        currentPageInsertCount = 0; // 重置当前页插入计数
        console.log("📄 当前页数", currentPage);

        // 优化后的代码
        console.log("🔍 查找页面内容列表...");
        const thList = await page.$$("tbody tr th.new");
        const pageItemCount = thList ? thList.length : 0;
        console.log(`✅ 找到 ${pageItemCount} 个内容项`);

        if (pageItemCount > 0) {
          for (let i = 0; i < pageItemCount; i++) {
            try {
              // 每次循环前检查主页面是否关闭
              if (page.isClosed()) {
                console.log("⚠️ 主页面已关闭，停止处理当前页");
                break;
              }

              console.log(`🔄 处理第 ${i + 1}/${pageItemCount} 个内容项...`);
              const th = thList[i];

              // 使用重试机制查找元素
              const a = await withRetry(
                () => th.$("a.xst"),
                `查找第 ${i + 1}/${pageItemCount} 个内容项链接`,
                page
              );

              // 先检查元素是否存在，再进行后续操作
              if (a && !page.isClosed()) {
                const title = await a.textContent();
                console.log(`📖 获取到标题: ${title}`);
                console.log("🔗 点击链接...");

                // 监听新页面打开事件
                let newPagePromise = context.waitForEvent("page", {
                  timeout: 15000,
                });

                await withRetry(
                  () => a.click(),
                  `点击第 ${i + 1}/${pageItemCount} 个内容项链接`,
                  page
                );

                try {
                  // 等待新页面打开
                  console.log("🕒 等待新页面打开...");
                  const newPage = await newPagePromise;

                  // 检查新页面是否有效
                  if (newPage.isClosed()) {
                    console.log("⚠️ 新页面已关闭，跳过处理");
                    continue;
                  }

                  try {
                    // 使用更短的超时时间，避免长时间等待
                    await withRetry(
                      () =>
                        newPage.waitForLoadState("domcontentloaded", {
                          timeout: 15000,
                        }),
                      "等待新页面加载完成",
                      newPage
                    );
                    console.log("✅ 新页面加载完成");
                  } catch (loadError) {
                    console.error(
                      "❌ 页面加载超时，尝试继续处理:",
                      loadError.message
                    );
                    // 即使加载超时，也尝试继续处理
                  }

                  // 切换到新的标签页
                  try {
                    await withRetry(
                      () => newPage.bringToFront(),
                      "切换到新页面",
                      newPage
                    );
                    console.log("✅ 切换到新页面");
                  } catch (bringError) {
                    console.log("⚠️ 切换到新页面失败:", bringError.message);
                    // 如果切换失败，跳过当前项目
                    if (!newPage.isClosed()) {
                      await newPage.close();
                    }
                    continue;
                  }

                  const name = title;

                  try {
                    console.log("🔍 查找内容区域...");
                    const showhide = await withRetry(
                      () => newPage.$(".showhide"),
                      "查找内容区域",
                      newPage
                    );

                    if (showhide) {
                      console.log("✅ 找到内容区域，开始提取数据...");

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
                          console.log("✅ 找到百度网盘链接：", baiduLinkText);
                        } else {
                          console.warn("⚠️ 未找到包含 pan.baidu.com 的链接");
                        }

                        const text = await showhide.textContent();
                        console.log("🔍 获取到内容文本，开始提取提取码...");

                        // 使用正则表达式匹配提取码
                        const matches = [...text.matchAll(regex)];

                        if (matches.length > 0) {
                          matches.forEach((match) => {
                            baiduCode = match[1];
                            console.log("✅ 提取码：", baiduCode);
                          });
                        } else {
                          console.warn("⚠️ 未找到提取码");
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
                          // 插入到数据库
                          await insertToDatabase(linkData);
                          console.log("✅ 数据保存完成");
                        } else {
                          console.log("⚠️ 数据不完整，跳过保存");
                        }
                      } catch (error) {
                        console.error("❌ 提取数据时出错:", error.message);
                      }
                    } else {
                      console.log("⚠️ 未解锁或未找到内容区域");
                    }
                  } catch (error) {
                    console.error("❌ 处理页面内容时出错:", error.message);
                  }

                  console.log(
                    `📊 当前进度: 本页已处理 ${
                      i + 1
                    }/${pageItemCount} 项, 已保存 ${saveCount} 个链接, 总执行次数 ${
                      i + (currentPage - 1) * pageItemCount
                    }`
                  );

                  try {
                    // 关闭新的标签页
                    console.log("🚪 关闭新页面...");
                    if (!newPage.isClosed()) {
                      await newPage.close();
                    }
                    // 切换回原来的标签页
                    if (!page.isClosed()) {
                      try {
                        await withRetry(
                          () => page.bringToFront(),
                          "切换回原页面",
                          page
                        );
                        console.log("✅ 切换回原页面");
                      } catch (bringBackError) {
                        console.log(
                          "⚠️ 切换回原页面超时，等待片刻后继续:",
                          bringBackError.message
                        );
                        // 等待一下再继续
                        await page.waitForTimeout(1000);
                      }
                    }
                  } catch (error) {
                    console.error("❌ 关闭页面时出错:", error.message);
                  }
                } catch (error) {
                  console.error(
                    `❌ 处理第 ${i + 1}/${pageItemCount} 个链接时出错:`,
                    error.message
                  );
                  // 尝试切换回原页面
                  if (!page.isClosed()) {
                    try {
                      await page.bringToFront();
                    } catch (bringBackError) {
                      console.log(
                        "⚠️ 切换回原页面超时，继续处理下一项:",
                        bringBackError.message
                      );
                    }
                  }
                }
              } else {
                console.log(
                  `⚠️ 第 ${
                    i + 1
                  }/${pageItemCount} 个 th 元素中未找到 a.xst 链接`
                );
                continue; // 跳过当前循环，处理下一个元素
              }
            } catch (error) {
              console.error(
                `❌ 处理第 ${i + 1}/${pageItemCount} 个内容项时出错:`,
                error.message
              );
              // 检查页面状态，如果页面已关闭则退出循环
              if (page.isClosed()) {
                console.log("❌ 主页面已关闭，停止处理当前页");
                break;
              }
              continue; // 继续处理下一个元素
            }
          }
        } else {
          console.log("⚠️ 当前页面没有找到内容列表");
        }

        // 打印本页统计信息
        console.log("=".repeat(50));
        console.log(`📊 第 ${currentPage} 页处理完成`);
        console.log(`✅ 本页成功插入: ${currentPageInsertCount} 条数据`);
        console.log(`📋 本页数据总数: ${pageItemCount} 条`);
        console.log(
          `📈 总执行次数: ${(currentPage - 1) * pageItemCount + pageItemCount}`
        );
        console.log(`💾 累计保存: ${saveCount} 个链接`);
        console.log("=".repeat(50));

        // 检查是否存在下一页按钮
        try {
          console.log("🔍 检查是否有下一页...");
          const nextBtn = await page.locator("#fd_page_top .pg .nxt");
          const nextBtnCount = await nextBtn.count();

          if (nextBtnCount > 0) {
            console.log("✅ 找到下一页按钮，点击进入下一页");

            await withRetry(() => nextBtn.click(), "点击下一页按钮", page);

            await withRetry(
              () => page.waitForLoadState("domcontentloaded"),
              "等待下一页加载完成",
              page
            );

            console.log("🚀 已进入下一页，继续处理");
            currentPage++;
          } else {
            console.log("⚠️ 没有下一页按钮，处理完成");
            hasNextPage = false;
          }
        } catch (error) {
          console.error("❌ 检查下一页时出错:", error.message);
          hasNextPage = false;
        }
      } catch (error) {
        console.error(`❌ 处理第 ${currentPage} 页时出错:`, error.message);
        hasNextPage = false;
      }
    }

    console.log("🎉 数据爬取完成!");
    console.log("=".repeat(50));
    console.log(`📊 统计信息:`);
    console.log(`✅ 总页数: ${currentPage - 1}`);
    console.log(`💾 总共保存了 ${saveCount} 个链接`);
    console.log(`📈 总执行次数: ${insertCount}`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("❌ getDatas函数出错:", error.message);
    console.error("❌ 错误堆栈:", error.stack);
    throw error;
  }
};

// 在测试结束后关闭数据库连接
test.afterAll(async () => {
  await closeDatabase();
});

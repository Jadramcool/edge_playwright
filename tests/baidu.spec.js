// @ts-check
import { test, expect } from "@playwright/test";
import mysql from "mysql2/promise";

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

    // 检查表中是否存在link_with_code字段，不存在则创建
    await createLinkWithCodeColumn();
    console.log("kb表检查完成");
  } catch (error) {
    console.error("数据库初始化失败:", error);
    throw error;
  }
}

// 创建字段
async function createLinkWithCodeColumn() {
  try {
    // 定义需要创建的字段配置（字段名、类型、默认值）
    const columnsToCreate = [
      { name: "link_with_code", type: "VARCHAR(255)", default: "NULL" },
      { name: "file_name", type: "VARCHAR(255)", default: "NULL" },
      { name: "status", type: "TINYINT(1)", default: "1" }, // 布尔值类型，默认值0（false）
    ];

    // 批量检查并创建字段
    for (const { name, type, default: defaultValue } of columnsToCreate) {
      // 检查字段是否存在
      const [columns] = await connection.execute(`
        SHOW COLUMNS FROM sykb LIKE '${name}'
      `);

      if (columns.length === 0) {
        // 拼接SQL语句（注意字符串转义，避免SQL注入风险）
        const sql = `
          ALTER TABLE sykb 
          ADD COLUMN ${name} ${type} DEFAULT ${defaultValue}
        `;
        await connection.execute(sql);
        console.log(`${name}字段创建成功`);
      }
    }
  } catch (error) {
    console.error("创建字段失败:", error);
    throw error;
  }
}

// 处理数据并更新数据库
async function processAndUpdateData() {
  if (!connection) {
    console.error("数据库连接未建立");
    return;
  }

  try {
    // 查询baidu_link_href和code字段
    const [rows] = await connection.execute(`
      SELECT id, baidu_link_href, baidu_code 
      FROM sykb 
      WHERE baidu_link_href IS NOT NULL AND baidu_code IS NOT NULL AND link_with_code IS NULL
    `);

    console.log(`查询到 ${rows.length} 条需要处理的数据`);

    // 逐条更新数据
    for (const row of rows) {
      const { id, baidu_link_href, baidu_code } = row;
      const linkWithCode = `${baidu_link_href}?pwd=${baidu_code}`;
      // 更新link_with_code字段
      await connection.execute(
        `UPDATE sykb SET link_with_code = ? WHERE id = ?`,
        [linkWithCode, id]
      );
    }

    console.log("数据更新完成");
  } catch (error) {
    console.error("处理数据失败:", error);
    throw error;
  }
}

// 关闭数据库连接
async function closeDatabase() {
  if (connection) {
    await connection.end();
    console.log("数据库连接已关闭");
  }
}

test("processBaiduLinkAndCode", async ({ page }) => {
  // 初始化数据库
  await initDatabase();

  // 首先，将数据库数据更新，将数据中的baidu_link_href和baidu_code字段拼接成link_with_code字段
  await processAndUpdateData();

  // 然后，从数据库中获取link_with_code字段的数据
  const [kbData] = await connection.execute(
    "SELECT id,link_with_code FROM sykb WHERE status = 1 AND file_name IS NULL"
  );

  // 获取总数并初始化进度计数器
  const totalCount = kbData.length;
  let completedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  console.log(`\n=== 开始处理百度网盘链接 ===`);
  console.log(`总共需要处理: ${totalCount} 个链接`);
  console.log(`==========================================\n`);

  for (const item of kbData) {
    const { id, link_with_code } = item;
    completedCount++;
    const remainingCount = totalCount - completedCount;

    console.log(`\n[${completedCount}/${totalCount}] 正在处理链接 ID: ${id}`);
    console.log(
      `进度: ${((completedCount / totalCount) * 100).toFixed(
        1
      )}% | 剩余: ${remainingCount} 个`
    );
    console.log(`链接: ${link_with_code}`);

    try {
      await page.goto(link_with_code);
      await page.waitForLoadState("networkidle");

      const firstTitle = await page.title();

      if (firstTitle === "百度网盘-链接不存在") {
        console.log(
          `❌ [${completedCount}/${totalCount}] 链接不存在，已标记为无效`
        );
        await connection.execute(`UPDATE sykb SET status =? WHERE id =?`, [
          0,
          id,
        ]);
        failedCount++;
      } else {
        const getDataBtn = page.getByText("提取文件");
        const btnCount = await getDataBtn.count();
        if (btnCount > 0) {
          console.log(
            `🔄 [${completedCount}/${totalCount}] 点击提取文件按钮...`
          );
          await getDataBtn.click();
          // 等待页面导航完成
          await page.waitForLoadState("networkidle");
          // await page.waitForTimeout(3000);
        }

        await page.waitForSelector('span:has-text("保存到网盘")', {
          timeout: 10000,
        });

        try {
          // 获取浏览器标签名
          const tabName = await page.title();
          const resultTitle = tabName.split(".")[0]; // 按.分割，取第一个元素
          console.log(
            `✅ [${completedCount}/${totalCount}] 成功获取文件名: ${resultTitle}`
          );
          // 将resultTitle保存到数据库中，字段名叫file_name
          await connection.execute(`UPDATE sykb SET file_name =? WHERE id =?`, [
            resultTitle,
            id,
          ]);
          successCount++;
        } catch (error) {
          console.log(
            `⚠️ [${completedCount}/${totalCount}] 获取页面标题失败: ${error.message}`
          );
          failedCount++;
          // 如果获取标题失败，可以尝试其他方式或跳过
        }
      }
    } catch (error) {
      console.log(
        `❌ [${completedCount}/${totalCount}] 处理链接时发生错误: ${error.message}`
      );
      failedCount++;
    }

    // 显示当前统计信息
    console.log(
      `📊 当前统计 - 成功: ${successCount} | 失败: ${failedCount} | 剩余: ${remainingCount}`
    );
    console.log(`${"-".repeat(50)}`);

    // 不需要关闭页面，让下一次循环重用同一个页面
  }

  // 最终统计信息
  console.log(`\n=== 处理完成 ===`);
  console.log(`总计处理: ${totalCount} 个链接`);
  console.log(`成功处理: ${successCount} 个`);
  console.log(`失败处理: ${failedCount} 个`);
  console.log(
    `成功率: ${
      totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 0
    }%`
  );
  console.log(`==========================================\n`);
});

// 在测试结束后关闭数据库连接
test.afterAll(async () => {
  await closeDatabase();
});


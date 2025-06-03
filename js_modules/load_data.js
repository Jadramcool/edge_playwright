// 将百度链接导出成一个txt文件
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

// 数据库配置
const dbConfig = {
  host: "117.72.60.94",
  port: 3306,
  user: "root",
  password: "JIADAOMING0119",
  database: "scraper_db",
};

/**
 * 导出百度链接数据到txt文件
 * @param {Object} options - 查询选项
 * @param {string} [options.startDate] - 开始日期 (YYYY-MM-DD)
 * @param {string} [options.endDate] - 结束日期 (YYYY-MM-DD)
 * @param {string} [options.date] - 单个日期 (YYYY-MM-DD)
 * @param {string} [options.outputPath] - 输出文件路径，默认为当前目录下的kbData.txt
 * @param {string} [options.field] - 要导出的字段，默认为download_info
 * @returns {Promise<Object>} 返回导出结果
 */
export async function exportKbData(options = {}) {
  const {
    startDate,
    endDate,
    date,
    outputPath = "kbData.txt",
    field = "download_info",
  } = options;

  let connection;

  try {
    // 连接数据库
    connection = await mysql.createConnection(dbConfig);
    console.log("数据库连接成功");

    // 构建查询条件
    let whereClause = "WHERE 1=1";
    const queryParams = [];

    if (date) {
      // 单日查询
      whereClause += " AND DATE(created_at) = ?";
      queryParams.push(date);
    } else if (startDate && endDate) {
      // 范围查询
      whereClause += " AND DATE(created_at) BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    } else if (startDate) {
      // 从某日期开始
      whereClause += " AND DATE(created_at) >= ?";
      queryParams.push(startDate);
    } else if (endDate) {
      // 到某日期结束
      whereClause += " AND DATE(created_at) <= ?";
      queryParams.push(endDate);
    }

    // 构建完整的SQL查询
    const sql = `SELECT ${field}, created_at FROM kb ${whereClause} ORDER BY created_at DESC`;
    console.log("执行SQL:", sql);
    console.log("查询参数:", queryParams);

    // 执行查询
    const [kbData] = await connection.execute(sql, queryParams);

    if (kbData.length === 0) {
      console.log("未找到符合条件的数据");
      return {
        success: true,
        count: 0,
        message: "未找到符合条件的数据",
        outputPath: null,
      };
    }

    // 将数据导出成数组
    const kbDataArray = kbData
      .map((item) => item[field])
      .filter((item) => item);

    // 按照数据，使用换行符分割，并且保存成txt文件
    const kbDataString = kbDataArray.join("\n");

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 将数据导出成txt文件
    fs.writeFileSync(outputPath, kbDataString, "utf8");

    // 输出统计信息
    console.log(`🚀 导出成功! 共 ${kbDataArray.length} 条数据`);
    console.log(`🚀 输出文件: ${outputPath}`);
    console.log(
      `🚀 查询时间范围: ${
        date || `${startDate || "开始"} 到 ${endDate || "结束"}`
      }`
    );

    return {
      success: true,
      count: kbDataArray.length,
      outputPath: outputPath,
      data: kbData,
      message: `成功导出 ${kbDataArray.length} 条数据到 ${outputPath}`,
    };
  } catch (error) {
    console.error("导出数据失败：", error);
    return {
      success: false,
      count: 0,
      error: error.message,
      message: `导出失败: ${error.message}`,
    };
  } finally {
    // 关闭数据库连接
    if (connection) {
      await connection.end();
      console.log("数据库连接已关闭");
    }
  }
}

// 使用示例（如果直接运行此文件）
if (import.meta.url === `file://${process.argv[1]}`) {
  // 示例1: 导出所有数据
  // await exportKbData();

  // 示例2: 导出指定日期的数据
  // await exportKbData({ date: '2025-06-02' });

  // 示例3: 导出日期范围的数据
  // await exportKbData({ startDate: '2025-06-01', endDate: '2025-06-03' });

  // 示例4: 自定义输出路径和字段
  await exportKbData({
    date: "2025-06-02",
    outputPath: "./exports/kbData_2025-06-02.txt",
    field: "download_info",
  });
}

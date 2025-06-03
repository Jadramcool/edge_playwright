import fs, { promises as fsPromises } from "fs";
import crypto from "crypto";
import path from "path";
import mysql from "mysql2/promise";
import readline from "readline";
// 启用 ES Module（package.json 中 "type": "module"）
import localHashes from "../exports/video-hashes.json" assert { type: "json" };
// 数据库配置
const dbConfig = {
  host: "117.72.60.94",
  port: 3306,
  user: "root",
  password: "JIADAOMING0119",
  database: "scraper_db",
};

let connection;

const initDatabase = async () => {
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log("数据库连接成功");
  } catch (error) {
    console.error("数据库连接失败：", error);
  }
};

const closeDatabase = async () => {
  if (connection) {
    await connection.end();
    console.log("数据库连接已关闭");
  }
};

// 创建字段
async function createLinkWithCodeColumn() {
  try {
    // 定义需要创建的字段配置（字段名、类型、默认值）
    const columnsToCreate = [
      { name: "hash", type: "VARCHAR(255)", default: "NULL" },
    ];

    // 批量检查并创建字段
    for (const { name, type, default: defaultValue } of columnsToCreate) {
      // 检查字段是否存在
      const [columns] = await connection.execute(`
          SHOW COLUMNS FROM kb LIKE '${name}'
        `);

      if (columns.length === 0) {
        // 拼接SQL语句（注意字符串转义，避免SQL注入风险）
        const sql = `
            ALTER TABLE kb 
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

// 支持的视频文件扩展名
const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mpg",
  ".mpeg",
];

/**
 * 计算文件的 SHA-256 哈希值
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} - 哈希值的十六进制字符串
 */
async function calculateFileHash(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * 递归遍历目录并计算视频文件的哈希值
 * @param {string} directory - 目录路径
 * @param {boolean} saveToDatabase - 是否将结果保存到数据库
 * @returns {Promise<Object[]>} - 包含文件路径和哈希值的对象数组
 */
async function calculateDirectoryHashes(directory, saveToDatabase = false) {
  const entries = await fsPromises.readdir(directory, { withFileTypes: true });
  const results = [];

  const entriesLength = entries.length;

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const title = entry.name.replace(/\.[^.]+$/, "");
    if (entry.isDirectory()) {
      // 递归处理子目录
      const subDirResults = await calculateDirectoryHashes(
        entryPath,
        saveToDatabase
      );
      results.push(...subDirResults);
    } else if (
      VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
    ) {
      // 计算视频文件的哈希值
      try {
        const hash = await calculateFileHash(entryPath);
        results.push({
          filePath: entryPath,
          fileName: title,
          hash,
        });
        console.log(`计算完成: ${entryPath} (${hash})`);
        if (saveToDatabase) {
          // 使用 await 确保 SQL 执行完成
          await connection.execute(
            "UPDATE kb SET hash = ? WHERE title = ? AND hash IS NULL",
            [hash, title]
          );
        }
      } catch (error) {
        console.error(`计算失败: ${entryPath}`, error);
      }
    }
    console.log(`进度: ${results.length}/${entriesLength}`);
  }

  return results;
}

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 生成哈希值
async function generateHash(
  isCommandLine = false,
  defaultPath = "",
  saveToDatabase
) {
  try {
    if (saveToDatabase) {
      await initDatabase();
      await createLinkWithCodeColumn();
    }

    let folderPath = defaultPath;

    if (isCommandLine) {
      // 提示用户输入目录路径
      rl.question(
        "请输入要处理的目录路径:（默认路径为 C:/新建文件夹/新建文件夹） ",
        async (directory) => {
          // 如果用户未输入路径，则使用默认路径
          if (!directory) {
            folderPath = "C:/新建文件夹/新建文件夹";
          }
        }
      );
    }

    try {
      await fsPromises.access(folderPath);
    } catch (error) {
      console.error(`目录不存在: ${folderPath}`);
      rl.close();
      return;
    }

    try {
      const hashes = await calculateDirectoryHashes(folderPath, saveToDatabase);
      console.log("\n所有视频文件的哈希值计算完成:");
      console.log(hashes);

      // 可选：将结果保存到 JSON 文件
      await fsPromises.writeFile(
        "./exports/video-hashes.json",
        JSON.stringify(hashes, null, 2)
      );
      console.log("结果已保存到 video-hashes.json");
    } catch (error) {
      console.error("处理过程中出错:", error);
    } finally {
      await closeDatabase();
      rl.close();
    }
  } catch (error) {
    console.error("初始化过程中出错:", error);
    rl.close();
  }
}

const compareHash = async () => {
  try {
    await initDatabase();

    // 从数据库中获取所有视频的哈希值
    const [rows] = await connection.execute(
      "SELECT * FROM kb WHERE hash IS NOT NULL"
    );

    // 存储相同哈希值的列表
    const sameHashList = [];

    // 遍历数据库中的哈希值
    for (const row of rows) {
      const { title, hash } = row;
      // 在本地哈希值中查找对应的哈希值
      const localHash = localHashes.find((item) => item.hash === hash);
      if (localHash) {
        sameHashList.push(localHash);
      }
    }

    let deleteCount = 0;
    sameHashList.forEach((item) => {
      // 删除本地文件
      try {
        if (fs.existsSync(item.filePath)) {
          fs.unlinkSync(item.filePath);
          console.log(`已删除文件: ${item.filePath}`);
          deleteCount++;
        } else {
          console.log(`文件不存在: ${item.filePath}`);
        }
      } catch (error) {
        console.error(`删除文件失败: ${item.filePath}`, error);
      }
    });
    console.log(`共删除 ${deleteCount} 个文件`);
  } catch (error) {
    console.error("初始化过程中出错:", error);
  }
};

generateHash(false, "D:/05Download/01安装包/系统盘/111/新建文件夹 (2)", false);
// compareHash();

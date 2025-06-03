import mysql from "mysql2/promise";
import fs from "fs";
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

const loadData = async (folderPath) => {
  try {
    await initDatabase();

    const [kbData] = await connection.execute(
      "SELECT * FROM kb WHERE status = 1 AND file_name IS NOT NULL"
    );
    // 获取title和file_name的对应关系;
    const titleFileMap = kbData.reduce((map, item) => {
      map[item.file_name] = item.title;
      return map;
    }, {});
    // 获取指定文件夹所有文件的名称
    const files = fs.readdirSync(folderPath);
    // 遍历文件进行重命名
    for (const file of files) {
      const filePath = `${folderPath}/${file}`;

      // 检查是否为文件（跳过文件夹）
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        continue;
      }

      // 提取文件名和扩展名
      const lastDotIndex = file.lastIndexOf(".");
      const fileName =
        lastDotIndex > 0 ? file.substring(0, lastDotIndex) : file;
      const fileExtension =
        lastDotIndex > 0 ? file.substring(lastDotIndex) : "";

      // 在titleFileMap中查找对应的title
      if (titleFileMap[fileName]) {
        const newFileName = titleFileMap[fileName] + fileExtension;
        const newFilePath = `${folderPath}/${newFileName}`;

        try {
          // 重命名文件
          fs.renameSync(filePath, newFilePath);
          console.log(`文件重命名成功: ${file} -> ${newFileName}`);
        } catch (renameError) {
          console.error(`文件重命名失败: ${file}`, renameError);
        }
      } else {
        console.log(`未找到对应的title: ${fileName}`);
      }
    }

    await closeDatabase();
  } catch (error) {
    console.error("获取数据失败：", error);
    await closeDatabase();
  }
};

loadData("C:/新建文件夹/test");

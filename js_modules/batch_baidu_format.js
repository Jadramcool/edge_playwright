import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES模块中获取__dirname的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { existsSync, readFileSync, mkdirSync, writeFileSync } = fs;
const { join, dirname, resolve } = path;

/**
 * 批量处理百度网盘链接格式化工具
 * 从dup.txt文件中提取转存失败的链接并重新格式化
 */
class BaiduLinkFormatter {
  constructor() {
    this.inputFile = join(__dirname, "../exports/dup2.txt");
    this.outputFile = join(__dirname, "../exports/failed_links_formatted2.txt");
    this.failedLinks = [];
    this.stats = {
      totalLines: 0,
      failedCount: 0,
      successCount: 0,
    };
  }

  /**
   * 读取输入文件内容
   * @returns {string} 文件内容
   */
  readInputFile() {
    try {
      if (!existsSync(this.inputFile)) {
        throw new Error(`输入文件不存在: ${this.inputFile}`);
      }

      const content = readFileSync(this.inputFile, "utf8");
      console.log(`✅ 成功读取文件: ${this.inputFile}`);
      return content;
    } catch (error) {
      console.error(`❌ 读取文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析文件内容，提取转存失败的链接
   * @param {string} content 文件内容
   */
  parseContent(content) {
    const lines = content.split("\n").filter((line) => line.trim());
    this.stats.totalLines = lines.length;

    console.log(`📊 开始解析 ${this.stats.totalLines} 行数据...`);

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      if (trimmedLine.includes("转存失败")) {
        const linkInfo = this.extractLinkInfo(trimmedLine);
        if (linkInfo) {
          this.failedLinks.push(linkInfo);
          this.stats.failedCount++;
        }
      } else if (trimmedLine.includes("转存成功")) {
        this.stats.successCount++;
      }

      // 显示进度
      if ((index + 1) % 100 === 0 || index === lines.length - 1) {
        const progress = (((index + 1) / lines.length) * 100).toFixed(1);
        console.log(`🔄 解析进度: ${progress}% (${index + 1}/${lines.length})`);
      }
    });

    console.log(`\n📈 解析完成统计:`);
    console.log(`   总行数: ${this.stats.totalLines}`);
    console.log(`   转存成功: ${this.stats.successCount}`);
    console.log(`   转存失败: ${this.stats.failedCount}`);
  }

  /**
   * 从行内容中提取链接和提取码信息
   * @param {string} line 行内容
   * @returns {Object|null} 链接信息对象或null
   */
  extractLinkInfo(line) {
    try {
      // 匹配百度网盘链接的正则表达式
      const linkRegex = /https:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+/;
      // 修改正则表达式以匹配实际格式：链接后直接跟提取码
      const codeRegex =
        /https:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+\s+([A-Za-z0-9]{4})/;

      const linkMatch = line.match(linkRegex);
      const codeMatch = line.match(codeRegex);

      if (linkMatch && codeMatch) {
        return {
          link: linkMatch[0],
          code: codeMatch[1],
          originalLine: line,
        };
      }

      return null;
    } catch (error) {
      console.warn(`⚠️  解析行内容失败: ${line.substring(0, 50)}...`);
      return null;
    }
  }

  /**
   * 格式化失败链接为指定格式
   * @returns {string} 格式化后的内容
   */
  formatFailedLinks() {
    console.log(`\n🔧 开始格式化 ${this.failedLinks.length} 个失败链接...`);

    const formattedLines = this.failedLinks.map((linkInfo, index) => {
      const formatted = `下载链接: ${linkInfo.link}  提取码: ${linkInfo.code}`;

      // 显示格式化进度
      if ((index + 1) % 20 === 0 || index === this.failedLinks.length - 1) {
        const progress = (
          ((index + 1) / this.failedLinks.length) *
          100
        ).toFixed(1);
        console.log(
          `🔄 格式化进度: ${progress}% (${index + 1}/${
            this.failedLinks.length
          })`
        );
      }

      return formatted;
    });

    return formattedLines.join("\n");
  }

  /**
   * 保存格式化后的内容到输出文件
   * @param {string} content 格式化后的内容
   */
  saveToFile(content) {
    try {
      // 确保输出目录存在
      const outputDir = dirname(this.outputFile);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(this.outputFile, content, "utf8");
      console.log(`\n✅ 成功保存到文件: ${this.outputFile}`);
      console.log(`📄 文件大小: ${(content.length / 1024).toFixed(2)} KB`);
    } catch (error) {
      console.error(`❌ 保存文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行完整的处理流程
   */
  async process() {
    console.log("🚀 开始批量处理百度网盘链接格式化...");
    console.log(`📁 输入文件: ${this.inputFile}`);
    console.log(`📁 输出文件: ${this.outputFile}`);
    console.log("=".repeat(60));

    try {
      // 1. 读取输入文件
      const content = this.readInputFile();

      // 2. 解析内容，提取失败链接
      this.parseContent(content);

      if (this.failedLinks.length === 0) {
        console.log("\n🎉 没有发现转存失败的链接！");
        return;
      }

      // 3. 格式化失败链接
      const formattedContent = this.formatFailedLinks();

      // 4. 保存到输出文件
      this.saveToFile(formattedContent);

      // 5. 显示最终统计
      console.log("\n" + "=".repeat(60));
      console.log("🎉 处理完成！最终统计:");
      console.log(`   📊 总处理行数: ${this.stats.totalLines}`);
      console.log(`   ✅ 转存成功: ${this.stats.successCount}`);
      console.log(`   ❌ 转存失败: ${this.stats.failedCount}`);
      console.log(
        `   📝 已格式化并保存: ${this.failedLinks.length} 个失败链接`
      );
      console.log(`   💾 输出文件: ${this.outputFile}`);
    } catch (error) {
      console.error(`\n💥 处理过程中发生错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 设置自定义输入文件路径
   * @param {string} filePath 输入文件路径
   */
  setInputFile(filePath) {
    this.inputFile = resolve(filePath);
    return this;
  }

  /**
   * 设置自定义输出文件路径
   * @param {string} filePath 输出文件路径
   */
  setOutputFile(filePath) {
    this.outputFile = resolve(filePath);
    return this;
  }

  /**
   * 获取处理统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      failedLinksCount: this.failedLinks.length,
    };
  }
}

/**
 * 便捷函数：直接处理默认文件
 */
export async function processDefault() {
  const formatter = new BaiduLinkFormatter();
  await formatter.process();
  return formatter.getStats();
}

/**
 * 便捷函数：处理指定文件
 * @param {string} inputFile 输入文件路径
 * @param {string} outputFile 输出文件路径（可选）
 */
export async function processFiles(inputFile, outputFile) {
  const formatter = new BaiduLinkFormatter();
  formatter.setInputFile(inputFile);
  if (outputFile) {
    formatter.setOutputFile(outputFile);
  }
  await formatter.process();
  return formatter.getStats();
}

// 导出主类
export { BaiduLinkFormatter };

// 直接运行时执行默认处理
processDefault().catch((error) => {
  console.error("执行失败:", error.message);
  process.exit(1);
});

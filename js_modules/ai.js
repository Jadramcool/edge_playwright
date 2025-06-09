// ollama_client.mjs
import axios from "axios";
import { createInterface } from "readline";
import { stdin as input, stdout as output } from "process";

const rl = createInterface({ input, output });
const OLLAMA_BASE_URL = "http://localhost:11434";
const MODEL_NAME = "gemma3:4b";

// 流式调用 Ollama API
async function callOllama(prompt) {
  const controller = new AbortController();

  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: MODEL_NAME,
        prompt: prompt,
        stream: true, // 启用流式输出
      },
      {
        headers: { "Content-Type": "application/json" },
        responseType: "stream",
        signal: controller.signal,
      }
    );

    return new Promise((resolve, reject) => {
      let fullResponse = "";

      response.data.on("data", (chunk) => {
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line) => line.trim() !== "");

        for (const line of lines) {
          try {
            // 移除 SSE 格式前缀
            const data = line.replace(/^data: /, "");
            if (!data) continue;

            const parsed = JSON.parse(data);
            if (parsed.response) {
              process.stdout.write(parsed.response);
              fullResponse += parsed.response;
            }

            if (parsed.end) {
              resolve(fullResponse);
            }
          } catch (e) {
            console.error("解析流数据时出错:", e.message);
          }
        }
      });

      response.data.on("end", () => resolve(fullResponse));
      response.data.on("error", (err) => reject(err));

      // 监听 Ctrl+C 终止请求
      process.on("SIGINT", () => {
        controller.abort();
        reject(new Error("用户中断"));
      });
    });
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("请求被取消");
    } else {
      console.error("调用 Ollama API 时出错:", error.message);
      if (error.response) {
        console.error("状态码:", error.response.status);
      }
    }
    throw error;
  }
}

async function chatWithModel() {
  while (true) {
    const userInput = await new Promise((resolve) => {
      rl.question("\n你: ", resolve);
    });

    if (userInput.toLowerCase() === "exit") {
      console.log("\n对话已结束。");
      rl.close();
      break;
    }

    console.log("模型:");
    const startTime = Date.now();

    try {
      await callOllama(userInput);
      const endTime = Date.now();
      console.log(
        `\n[响应时间: ${((endTime - startTime) / 1000).toFixed(2)}s]`
      );
    } catch (error) {
      console.log("\n发生错误，请重试。");
    }
  }
}

console.log(`正在连接到 Ollama 模型: ${MODEL_NAME}`);
console.log('输入 "exit" 结束对话。');
chatWithModel();

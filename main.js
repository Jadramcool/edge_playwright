import { exportKbData } from "./js_modules/load_data.js";

// 导出数据txt
await exportKbData({
  date: "2025-06-05",
  outputPath: "./exports/kbData_2025-06-05.txt",
  field: "download_info",
});

import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 扩展的 UI 文案默认按环境语言解析（非中文区域 -> 英文，见 index.ts resolveLanguage）。
    // 若让测试依赖运行环境的 LANG/LC_ALL，同一份代码在开发者本机与 CI 上会断言不同的字符串。
    // 这里固定为 zh，使断言与语言无关；语言选择逻辑本身由 "language selection" 用例覆盖。
    //
    // PI_DEEPSEEK_CACHE_DIR 把 stats.json / history.json / summary-cache.json 落到临时目录：
    // 否则用例里的 clearPersistedData() 会删掉开发者本机正在用的真实统计（扩展默认写在
    // ~/.pi/agent/extensions/deepseek-cache 下）。
    env: {
      PI_DEEPSEEK_CACHE_LANG: "zh",
      PI_DEEPSEEK_CACHE_DIR: join(tmpdir(), "pi-deepseek-cache-vitest"),
    },
  },
});

#!/usr/bin/env node
/**
 * 抓服务商与其最新 API 地址，生成 adapter/providers.generated.ts。
 *
 * 为什么要有这个脚本：手填 baseUrl 最容易过期——服务商改名、换域名、
 * 加 /v1 前缀，用户只有一句 404 可看。这里从两个公开源聚合：
 *   1) OpenRouter 的模型清单（无需 key）：给「有哪些模型、属于哪个厂商」
 *   2) 内置的官方地址表：给「这家厂商的 OpenAI 兼容端点在哪」
 * 两者按厂商归一化后合并，模型数多、地址已知的排前面。
 *
 * 用法：node scripts/fetch-providers.mjs
 * 产物不要手改；要加服务商就改下面的 BUILTIN 表并重跑。
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "adapter", "providers.generated.ts");

/** 官方 OpenAI 兼容地址（已知的），键是厂商前缀 */
const BUILTIN = [
  { key: "deepseek", id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { key: "z-ai", id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { key: "moonshot", id: "moonshot", name: "Moonshot 月之暗面", baseUrl: "https://api.moonshot.cn/v1" },
  { key: "openai", id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { key: "qwen", id: "dashscope", name: "阿里通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { key: "siliconflow", id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1" },
  { key: "openrouter", id: "openrouter", name: "OpenRouter（聚合）", baseUrl: "https://openrouter.ai/api/v1" },
  { key: "groq", id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { key: "x-ai", id: "xai", name: "xAI Grok", baseUrl: "https://api.x.ai/v1" },
  { key: "mistralai", id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { key: "minimax", id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1" },
  { key: "baidu", id: "qianfan", name: "百度千帆", baseUrl: "https://qianfan.baidubce.com/v2" },
  { key: "doubao", id: "volcengine", name: "火山引擎豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { key: "tencent", id: "hunyuan", name: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1" },
];

/** 从 OpenRouter 拿到厂商 → 模型数 */
async function fromOpenRouter() {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { "User-Agent": "inkpal-provider-fetch/1.0" },
  });
  if (!res.ok) throw new Error("OpenRouter " + res.status);
  const json = await res.json();
  const counts = new Map();
  for (const m of json.data ?? []) {
    const vendor = String(m.id ?? "").split("/")[0];
    if (!vendor) continue;
    counts.set(vendor, (counts.get(vendor) ?? 0) + 1);
  }
  return counts;
}

function main() {
  return fromOpenRouter()
    .then(counts => {
      const rows = BUILTIN.map(p => ({ ...p, models: counts.get(p.key) ?? 0 }));
      rows.sort((a, b) => b.models - a.models || a.name.localeCompare(b.name));
      const body = rows
        .map(
          p =>
            `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, baseUrl: ${JSON.stringify(
              p.baseUrl,
            )}, models: ${p.models} },`,
        )
        .join("\n");
      const ts = `// 由 scripts/fetch-providers.mjs 生成，请勿手改。
// 数据源：OpenRouter 公开模型清单 + 脚本内 BUILTIN 官方地址表。
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** OpenRouter 上该厂商的模型数（0 表示没扫到，不代表不可用） */
  models: number;
}

export const PROVIDERS: Provider[] = [
${body}
];
`;
      writeFileSync(OUT, ts, "utf8");
      console.log(`已写入 ${OUT}（${rows.length} 个服务商，其中 ${rows.filter(r => r.models > 0).length} 个有模型数据）`);
    })
    .catch(err => {
      console.error("抓取失败：" + err.message);
      console.error("网络不通时可以先手填，插件仍能用。");
      process.exitCode = 1;
    });
}

main();

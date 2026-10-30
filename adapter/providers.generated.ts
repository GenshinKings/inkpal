// 由 scripts/fetch-providers.mjs 生成，请勿手改。
// 数据源：OpenRouter 公开模型清单 + 脚本内 BUILTIN 官方地址表。
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** OpenRouter 上该厂商的模型数（0 表示没扫到，不代表不可用） */
  models: number;
}

export const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: 98 },
  { id: "dashscope", name: "阿里通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: 42 },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", models: 21 },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: 18 },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: 15 },
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", models: 9 },
  { id: "xai", name: "xAI Grok", baseUrl: "https://api.x.ai/v1", models: 8 },
  { id: "hunyuan", name: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", models: 7 },
  { id: "openrouter", name: "OpenRouter（聚合）", baseUrl: "https://openrouter.ai/api/v1", models: 6 },
  { id: "qianfan", name: "百度千帆", baseUrl: "https://qianfan.baidubce.com/v2", models: 0 },
  { id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", models: 0 },
  { id: "volcengine", name: "火山引擎豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", models: 0 },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: 0 },
  { id: "moonshot", name: "Moonshot 月之暗面", baseUrl: "https://api.moonshot.cn/v1", models: 0 },
];

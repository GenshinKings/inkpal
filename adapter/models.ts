import { requestUrl } from "obsidian";

/**
 * 拉模型列表：OpenAI 兼容服务都有 GET /models。
 *
 * 为什么要这个：模型名写错（比如 deepseek-v4.1-flash）只会得到一句 400，
 * 用户根本不知道该填什么。直接从服务商拉一次，给个下拉框选，就不会再错。
 *
 * 用 requestUrl 而不是 fetch：Obsidian 渲染进程有 CORS 限制，直连会被拦成
 * 「Failed to fetch」；requestUrl 走主进程。
 */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("先填服务地址");
  const res = await requestUrl({
    url: base + "/models",
    method: "GET",
    headers: apiKey ? { Authorization: "Bearer " + apiKey } : {},
    throw: false,
  });
  if (res.status >= 400) {
    const text = typeof res.text === "string" ? res.text : "";
    throw new Error("拉取失败 " + res.status + (text ? "：" + text.slice(0, 120) : ""));
  }
  const data = res.json as { data?: { id?: string }[] } | { id?: string }[];
  const list = Array.isArray(data) ? data : ((data && data.data) ?? []);
  const ids = list.map(m => m?.id).filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0) throw new Error("服务商没有返回任何模型");
  return ids.sort();
}

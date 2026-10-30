/**
 * 拉模型列表：OpenAI 兼容服务都有 GET /models。
 *
 * 为什么要这个：模型名写错（比如 deepseek-v4.1-flash）只会得到一句 400，
 * 用户根本不知道该填什么。直接从服务商拉一次，给个下拉框选，就不会再错。
 */
export interface ModelInfo {
  id: string;
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("先填服务地址");
  const res = await fetch(base + "/models", {
    method: "GET",
    headers: apiKey ? { Authorization: "Bearer " + apiKey } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("拉取失败 " + res.status + (text ? "：" + text.slice(0, 120) : ""));
  }
  const data = (await res.json()) as { data?: ModelInfo[] } | ModelInfo[];
  const list = Array.isArray(data) ? data : (data.data ?? []);
  const ids = list.map(m => m.id).filter(Boolean);
  if (ids.length === 0) throw new Error("服务商没有返回任何模型");
  return ids.sort();
}

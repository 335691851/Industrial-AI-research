// Aliases normalize reporting languages; they are never a source of company facts.
const aliases: [RegExp, string][] = [
  [/sony\s*semiconductor(?:\s*solutions)?|索尼半导体(?:解决方案)?(?:公司)?|sony|索尼/gi, "索尼"],
  [/saudi\s*aramco|aramco|沙特阿美|阿美/gi, "沙特阿美"],
  [/siemens|西门子/gi, "西门子"],
  [/nvidia|英伟达/gi, "英伟达"],
  [/dassault\s*syst[eè]mes|达索系统/gi, "达索系统"],
  [/nancal|能科科技/gi, "能科科技"],
  [/irootech|rootcloud|树根科技|树根互联/gi, "树根互联"],
  [/supcon|中控技术/gi, "中控技术"],
  [/xuelang(?:yun)?|雪浪云|雪浪数制/gi, "雪浪数制"],
  [/honeycomb\s*(?:tech)?|蜂巢互联/gi, "蜂巢互联"],
  [/gstar(?:cad)?|浩辰软件/gi, "浩辰软件"],
  [/ainnovation|创新奇智/gi, "创新奇智"],
  [/anthropic/gi, "anthropic"],
  [/memorandum\s*of\s*understanding|mou|非约束性(?:协议|谅解备忘录)|合作备忘录|谅解备忘录/gi, "备忘录"],
  [/industrial\s*(?:ai|artificial intelligence)|工业人工智能|工业ai/gi, "工业智能"],
];
export function identityText(value: string) {
  let result = value.normalize("NFKC").toLowerCase();
  for (const [pattern, replacement] of aliases) result = result.replace(pattern, replacement);
  return result.replace(/[\s\p{P}\p{S}]/gu, "");
}
export function textSimilarity(a: string, b: string) {
  const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2)));
  const left = grams(identityText(a)), right = grams(identityText(b));
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((part) => right.has(part)).length;
  return 2 * overlap / (left.size + right.size);
}
// Hash routes identify SPA pages; ordinary in-page anchors do not.
export function normalizePageFragment(url: URL) {
  if (!/^#!?\//.test(url.hash)) url.hash = "";
}
export function evidenceUrl(value: string) {
  try {
    const url = new URL(value);
    normalizePageFragment(url);
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.hash ? url.toString() : url.toString().replace(/\/$/, "");
  } catch { return value; }
}

export const companyWebsites: Record<string, string> = {
  西门子: "https://www.siemens.com/",
  达索系统: "https://www.3ds.com/",
  英伟达: "https://www.nvidia.com/",
  ptc: "https://www.ptc.com/",
  中控技术: "https://www.supcon.com/",
  树根互联: "https://www.irootech.com/",
  能科科技: "https://www.nancal.com/",
  索辰科技: "https://www.demxs.com/",
  雪浪数制: "https://www.xuelangyun.com/",
  蜂巢互联: "https://www.honeycombtech.com/",
  浩辰软件: "https://www.gstarcad.com/",
  创新奇智: "https://www.ainnovation.com/",
  anthropic: "https://www.anthropic.com/",
};

const companySearchAliases: Record<string, string[]> = {
  雪浪数制: ["雪浪数制", "雪浪云", "Xuelang"],
  蜂巢互联: ["蜂巢互联", "Honeycomb Tech"],
  浩辰软件: ["浩辰软件", "GstarCAD", "Gstarsoft"],
  创新奇智: ["创新奇智", "AInnovation"],
  英伟达: ["NVIDIA", "英伟达"],
  达索系统: ["达索系统", "Dassault Systèmes"],
  西门子: ["西门子", "Siemens"],
  树根互联: ["树根互联", "树根科技", "RootCloud", "iRootech"],
  中控技术: ["中控技术", "SUPCON"],
};

export function companySearchTerms(name: string) {
  return companySearchAliases[identityText(name)] ?? [name];
}

export function officialWebsite(name: string, overrides?: Record<string, string>) {
  return overrides?.[name] || companyWebsites[identityText(name)];
}
export function belongsToWebsite(url: string, website: string) {
  try {
    const host = new URL(url).hostname;
    const root = new URL(website).hostname.replace(/^www\./, "");
    return host === root || host.endsWith(`.${root}`);
  } catch { return false; }
}

export function knownOfficialUrl(url: string) {
  return Object.values(companyWebsites).some((website) => belongsToWebsite(url, website));
}

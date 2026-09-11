import {
  Database,
  providers,
} from "./domain";

export const requiredFocusCompanies = ["雪浪数制", "蜂巢互联", "创新奇智"] as const;

export const defaultSettings: Database["settings"] = {
  revision: 0,
  keywords: [
    "工业互联网",
    "工业智能体",
    "3D生成",
    "几何内核",
    "物理AI",
    "云化仿真",
    "数字孪生",
    "预测性维护",
    "制造业大模型",
    "工业软件融资",
  ],
  companies: [
    "西门子",
    "达索系统",
    "NVIDIA",
    "PTC",
    "中控技术",
    "树根互联",
    "能科科技",
    "索辰科技",
    ...requiredFocusCompanies,
  ],
  sources: [
    {
      id: "chicheng",
      name: "炽橙科技 · 企业基线",
      url: "https://www.czy3d.com/about-us/",
      kind: "website",
      enabled: true,
    },
    {
      id: "siemens",
      name: "Siemens · 全球新闻中心",
      url: "https://press.siemens.com/global/en",
      kind: "website",
      enabled: true,
    },
    {
      id: "nvidia",
      name: "NVIDIA · 官方博客",
      url: "https://blogs.nvidia.com/",
      kind: "website",
      enabled: true,
    },
    {
      id: "dassault",
      name: "达索系统 · 新闻中心",
      url: "https://www.3ds.com/newsroom/press-releases",
      kind: "website",
      enabled: true,
    },
    {
      id: "ptc",
      name: "PTC · 新闻中心",
      url: "https://www.ptc.com/en/news",
      kind: "website",
      enabled: true,
    },
    {
      id: "arxiv",
      name: "arXiv · 人工智能研究",
      url: "https://rss.arxiv.org/rss/cs.AI",
      kind: "rss",
      enabled: true,
    },
  ],
  selectedProvider: "deepseek",
  models: {
    deepseek: providers.deepseek.model,
    openai: providers.openai.model,
    glm: providers.glm.model,
    qwen: providers.qwen.model,
  },
};

export function emptyDatabase(): Database {
  return {
    settings: structuredClone(defaultSettings),
    credentials: {},
    items: [],
    profiles: [],
    runs: [],
    archives: [],
  };
}

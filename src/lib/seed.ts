import {
  Database,
  Item,
  Profile,
  providers,
  topics,
  categories,
} from "./domain";

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
  };
}
export function demoDatabase(): Database {
  const db = emptyDatabase();
  const titles = [
    "工业 AI 正在从单点工具走向可执行的智能体平台",
    "生成式 3D 与物理仿真的结合，成为数字孪生下一站",
    "制造业大模型的竞争，转向现场数据与工程知识",
    "工业软件资本动向：持续跟踪融资与战略合作披露",
    "从设备连接到自主运维：工业互联网的价值链延伸",
    "自然语言驱动的 CAD 建模，值得关注工程约束能力",
    "虚实融合工厂：仿真与生产数据形成闭环",
    "行业观察：工业智能体的落地需要可验证的执行结果",
    "多模态工业知识库：连接图纸、手册与设备数据",
    "预测性维护：从故障识别迈向维修决策支持",
    "3D 资产生成研究：几何精度与工程可用性仍是关键",
    "企业观察：产品叙事从平台能力转向行业业务价值",
  ];
  const companies = [
    "西门子",
    "NVIDIA",
    "中控技术",
    "行业综合",
    "树根互联",
    "达索系统",
    "PTC",
    "能科科技",
    "西门子",
    "中控技术",
    "NVIDIA",
    "达索系统",
  ];
  db.items = titles.map((title, i): Item => ({
    id: `demo-${i}`,
    eventKey: `demo-${i}`,
    title,
    summary: [
      "关注平台化产品如何把工业知识、工具调用和业务流程连接起来，以及是否披露可验证的客户落地成果。",
      "研究三维表示、物理约束与仿真数据的融合，重点评估几何精度、推理效率与制造场景适配。",
      "持续观察产品组合、技术能力和商业路径的变化，辨别发布承诺与已交付能力。",
    ][i % 3],
    implication:
      "炽橙关注：结合自主几何内核、云化仿真与工业智能体，验证智能运维场景的差异化价值。",
    category: categories[i % categories.length],
    topic: topics[i % topics.length],
    importance: i === 0 ? "critical" : i < 4 ? "high" : "normal",
    company: companies[i],
    publishedAt: new Date(
      Date.now() - (i % 5) * 86400000 - 3600000,
    ).toISOString(),
    observedAt: new Date().toISOString(),
    confidence: 0.85,
    evidence: [],
    demo: true,
    runId: "demo",
  }));
  db.profiles = ["西门子", "NVIDIA", "达索系统", "中控技术"].map(
    (name, i): Profile => ({
      id: `demo-p-${i}`,
      name,
      narrative: [
        "以工业自动化与软件连接真实世界和数字世界",
        "以加速计算与仿真生态构建物理 AI 技术底座",
        "以虚拟孪生连接产品设计、仿真与全生命周期",
        "围绕流程工业构建自动化与智能化产品体系",
      ][i],
      positioning: "示例研究框架 · 待智能体基于原文核实",
      solutions: ["工业智能平台", "数字孪生与仿真", "行业应用解决方案"],
      capabilities: ["工业知识融合", "数据与模型协同"],
      funding: "未披露",
      implication: "比较平台开放性、工程能力与智能运维落地路径。",
      evidence: [],
      updatedAt: new Date().toISOString(),
      demo: true,
    }),
  );
  return db;
}

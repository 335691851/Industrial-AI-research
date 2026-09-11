import type { Item, Settings } from "./domain";
import { dedupeEvidence, priorityScore } from "./domain";
import { identityText } from "./identity";
import {
  isTrustedSource,
  sourcePublisher,
  sourceTier,
} from "./source-policy";

export type QualityAssessment = {
  publishable: boolean;
  reasons: string[];
};

const industrialScope =
  /工业|制造(?:业|现场|设备|工厂)|工厂|生产线|工艺(?:优化|控制|仿真)|工业软件|工业互联网|物理\s*ai|physical\s*ai|3d\s*(?:ai|模型)|cae|cad|plm|mes|scada|数字主线|预测性维护|装备|机器(?:人|视觉)|自动化/i;
const excludedScope =
  /基因|生命健康|医疗|诊疗|医院|患者|药物|健康管理|智健|消费金融|电商营销/i;
const concreteEvent =
  /发布|披露|公布|推出|上线|开源|投产|量产|部署|中标|签约|签署|订单|收购|并购|融资|投资|完成\s*[a-z轮]|获批|立项|成立|升级|版本|平台|产品|系统|印发|出台|审议通过|征求意见|施行|启动.*试点|标准|规范|论文|研究预览|research preview|提出.*(?:模型|方法|架构|数据集|基准)|验证.*(?:能力|性能)|专利|客户案例|技术突破|营收|收入|利润/i;
const analysisEvidence =
  /报告|白皮书|指数|调查|调研|统计|数据|政策|规划|标准|论文|研究|benchmark|survey/i;
const vaguePartnership = /合作|伙伴|生态|联盟|备忘录|谅解备忘录|\bmou\b|partnership/i;
const materialDeliverable =
  /融资|投资|收购|并购|订单|合同|中标|金额|联合发布|共同开发|开源|产品|平台|系统|部署|投产|量产|客户|实验室|标准|规范|研究预览|research preview/i;
const genericNarrative =
  /加速.*落地|推动.*发展|赋能.*转型|助力.*升级|向.*纵深|未来可期|开启新篇章|共创.*未来/i;

function isFocusCompany(company: string, companies: string[]) {
  const key = identityText(company);
  return companies.some((name) => identityText(name) === key);
}

function materialNumbers(value: string) {
  return [...value.matchAll(/\d+(?:\.\d+)?\s*(?:亿|万|%|％|家|项|套|台|份|轮|倍)/g)]
    .map((match) => match[0].replace(/\s+/g, ""));
}

/** A deterministic final gate applied after model extraction and grounding. */
export function assessIntelligence(
  item: Item,
  settings: Pick<Settings, "companies" | "sources" | "companyWebsites">,
): QualityAssessment {
  const reasons: string[] = [];
  const evidence = dedupeEvidence(item.evidence.filter((entry) =>
    isTrustedSource(entry.url, settings.companyWebsites)));
  const evidenceText = evidence.map((entry) => `${entry.title} ${entry.quote}`).join(" ");
  const claim = `${item.title} ${item.summary}`;
  const allText = `${claim} ${evidenceText}`;
  const focus = isFocusCompany(item.company, settings.companies);

  if (!evidence.length) reasons.push("缺少可核验原文");
  if (item.confidence < 0.68) reasons.push("研究置信度不足");

  const inScope = industrialScope.test(allText) ||
    (focus && /融资|投资|并购|收购|战略|营收|上市|组织|产品|技术|客户|交付/i.test(allText));
  if (!inScope || (excludedScope.test(allText) && !industrialScope.test(claim)))
    reasons.push("超出工业智能研究边界");

  if (!concreteEvent.test(claim)) reasons.push("缺少可验证的具体变化");
  if ((item.company === "行业" || identityText(item.company) === "行业") &&
      genericNarrative.test(claim) && !analysisEvidence.test(allText))
    reasons.push("仅为泛化趋势表述");
  if (vaguePartnership.test(claim) && !materialDeliverable.test(claim))
    reasons.push("合作披露缺少实质成果");
  const tiers = evidence.map((entry) => sourceTier(entry.url, settings.companyWebsites));
  const publishers = new Set(evidence.map((entry) =>
    sourcePublisher(entry.url, settings.companyWebsites)).filter(Boolean));
  const hasPrimary = tiers.includes("primary");
  const hasAuthoritative = tiers.includes("authoritative");
  const focusProfessional = focus && tiers.includes("professional") &&
    item.importance !== "normal" && item.confidence >= 0.82;
  const independentlyConfirmed = publishers.size >= 2 && item.confidence >= 0.78;
  const authoritativeSingle = hasAuthoritative && item.confidence >= 0.76;
  if (evidence.length && !hasPrimary && !authoritativeSingle &&
      !focusProfessional && !independentlyConfirmed)
    reasons.push("来源层级或独立交叉印证不足");
  // A primary-source policy, standard or technical result can be useful without
  // being labelled "high" by the model. Ordinary third-party news still needs
  // either strategic focus or a higher importance assessment.
  if (item.importance === "normal" && !focus && !hasPrimary)
    reasons.push("未达到情报展示价值门槛");

  const unsupportedNumbers = materialNumbers(claim).filter((number) =>
    !evidenceText.replace(/\s+/g, "").includes(number),
  );
  if (unsupportedNumbers.length) reasons.push("标题或摘要中的关键数字无原文支持");

  const preview = /research preview|研究预览|proposed specification|共享规范|草案/i.test(evidenceText);
  const productionClaim = /正式发布.*工具|推出.*工具|自主操作.*(?:设备|机器)|自主控制.*(?:设备|机器)|已部署|投入生产/i.test(claim);
  if (preview && productionClaim) reasons.push("结论强度超过原文披露");

  return { publishable: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function filterPublishableIntelligence(
  items: Item[],
  settings: Pick<Settings, "companies" | "sources" | "companyWebsites">,
) {
  const rejected = new Map<string, number>();
  const accepted = items.map((item) => ({ ...item,
    evidence: dedupeEvidence(item.evidence.filter((entry) =>
      isTrustedSource(entry.url, settings.companyWebsites))),
  })).filter((item) => {
    const result = assessIntelligence(item, settings);
    for (const reason of result.reasons)
      rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
    return result.publishable;
  });
  return { accepted, rejected };
}

/**
 * Prevent a prolific company or category from monopolising the dashboard while
 * guaranteeing that configured focus companies and all available categories
 * receive a first pass. This is a presentation portfolio, not a search limit.
 */
export function balancePublishedIntelligence(
  items: Item[],
  settings: Pick<Settings, "companies">,
  max = 72,
) {
  const focusKeys = new Set(settings.companies.map(identityText));
  const ranked = [...items].sort((a, b) => priorityScore(b) - priorityScore(a));
  const selected: Item[] = [];
  const selectedIds = new Set<string>();
  const companyCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const companyKey = (item: Item) => identityText(item.company || "行业") || "行业";
  const companyCap = (key: string) => key === "行业" ? 14 : focusKeys.has(key) ? 5 : 3;
  const canAdd = (item: Item) => {
    const key = companyKey(item);
    return !selectedIds.has(item.id) &&
      (companyCounts.get(key) ?? 0) < companyCap(key) &&
      (categoryCounts.get(item.category) ?? 0) < 16;
  };
  const add = (item: Item) => {
    if (selected.length >= max || !canAdd(item)) return;
    const key = companyKey(item);
    selected.push(item);
    selectedIds.add(item.id);
    companyCounts.set(key, (companyCounts.get(key) ?? 0) + 1);
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  };

  // One high-value signal per configured company and category before filling.
  for (const key of focusKeys) {
    const item = ranked.find((candidate) => companyKey(candidate) === key);
    if (item) add(item);
  }
  for (const category of new Set(ranked.map((item) => item.category))) {
    const item = ranked.find((candidate) => candidate.category === category && canAdd(candidate));
    if (item) add(item);
  }
  for (const item of ranked) add(item);
  return selected.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

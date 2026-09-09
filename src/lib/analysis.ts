import { Item, categories, isMajorSignal, priorityScore, recentIntelligence, validDate } from "./domain";
import { evidenceUrl, identityText } from "./identity";

export function researchAnalysis(input: Item[], days: 7 | 14 = 7, now = new Date()) {
  const items = input.filter((item) => recentIntelligence(item, now));
  const dated = items.filter((item) => validDate(item.publishedAt));
  const end = now.getTime(), period = days * 86400000;
  const current = dated.filter((item) => Date.parse(item.publishedAt!) > end - period);
  const previous = dated.filter((item) => Date.parse(item.publishedAt!) <= end - period && Date.parse(item.publishedAt!) > end - 2 * period);
  const names = [...new Set([...current, ...previous].map((item) => item.topic))];
  const movement = names.map((topic) => {
    const recent = current.filter((item) => item.topic === topic).length;
    const earlier = previous.filter((item) => item.topic === topic).length;
    return { topic, recent, earlier, delta: recent - earlier };
  }).sort((a, b) => b.recent - a.recent || b.earlier - a.earlier);
  const actions = categories.map((category) => {
    const matching = items.filter((item) => item.category === category);
    return { category, count: matching.length, major: matching.filter(isMajorSignal).length,
      example: [...matching].sort((a, b) => priorityScore(b, now) - priorityScore(a, now))[0] };
  }).filter((action) => action.count).sort((a, b) => b.count - a.count);
  const focus = [...new Set(items.map((item) => item.topic))].map((topic) => {
    const matching = items.filter((item) => item.topic === topic);
    const companies = new Set(matching.map((item) => identityText(item.company)).filter((name) => name && name !== "行业"));
    const sources = new Set(matching.flatMap((item) => item.evidence.map((e) => evidenceUrl(e.url))));
    const example = [...matching].sort((a, b) => priorityScore(b, now) - priorityScore(a, now))[0];
    return { topic, count: matching.length, companies: companies.size, sources: sources.size, example,
      major: matching.filter(isMajorSignal).length };
  }).sort((a, b) => b.major - a.major || b.count - a.count).slice(0, 3);
  return { total: items.length, dated: dated.length, fallback: items.length - dated.length,
    major: items.filter(isMajorSignal).length, current: current.length, previous: previous.length,
    movement, actions, focus };
}

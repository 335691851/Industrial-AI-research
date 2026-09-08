import { collectSource } from "../src/server/collector";
async function main() {
  const result = await collectSource(
    {
      id: "chicheng",
      name: "炽橙官网",
      url: "https://www.czy3d.com/about-us/",
      kind: "website",
      enabled: true,
    },
    AbortSignal.timeout(30000),
    false,
  );
  console.log(
    JSON.stringify(
      result.map((d) => ({
        url: d.url,
        title: d.title,
        characters: d.text.length,
        publishedAt: d.publishedAt,
      })),
      null,
      2,
    ),
  );
}
void main().catch(() => {
  console.error("真实来源采集失败，请检查网络或目标网站的访问限制。");
  process.exitCode = 1;
});

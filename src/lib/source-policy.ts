import { belongsToWebsite, companyWebsites } from "./identity";

export type SourceTier = "primary" | "authoritative" | "professional" | "untrusted";

// Primary sources may support a claim on their own: company sites, regulators,
// exchanges, governments, standards bodies and research repositories.
const primaryDomains = [
  "gov.cn", "gov.uk", "gov.au", "canada.ca", "gouv.fr", "bund.de",
  "go.jp", "gov.sg", "gov.in", "gov.kr", "whitehouse.gov", "congress.gov",
  "sec.gov", "nist.gov", "energy.gov", "europa.eu",
  "cas.cn", "edu.cn", "mit.edu", "stanford.edu", "arxiv.org",
  "ieee.org", "acm.org", "iso.org", "iec.ch", "openreview.net",
  "roboticsproceedings.org", "proceedings.mlr.press",
  "sse.com.cn", "szse.cn", "cninfo.com.cn", "hkexnews.hk",
];
const additionalCompanyDomains = [
  "czy3d.com", "sony.com", "sony-semicon.com", "aramco.com",
  "abb.com", "se.com", "rockwellautomation.com", "honeywell.com",
  "autodesk.com", "ansys.com", "aveva.com", "hexagon.com",
  "microsoft.com", "ibm.com", "aws.amazon.com", "research.google",
];

// Accountable newsrooms and selected specialist industrial publishers expand
// discovery without granting trust to arbitrary portals or syndicated copies.
const authoritativeDomains = [
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com",
  "xinhuanet.com", "people.com.cn", "cctv.com", "cnr.cn",
  "chinadaily.com.cn", "ce.cn", "cnstock.com", "stcn.com",
  "cs.com.cn", "yicai.com", "nature.com", "science.org",
];
const professionalDomains = ["e-works.net.cn", "gongkong.com"];

function configuredCompanyDomains(overrides?: Record<string, string>) {
  const websites = [...Object.values(companyWebsites), ...Object.values(overrides ?? {})];
  return websites.flatMap((website) => {
    try {
      const url = new URL(website);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? [url.hostname.replace(/^www\./, "").toLowerCase()] : [];
    } catch { return []; }
  });
}

export function primarySearchDomains(overrides?: Record<string, string>) {
  return [...new Set([
    ...primaryDomains,
    ...additionalCompanyDomains,
    ...configuredCompanyDomains(overrides),
  ])];
}

// Compatibility name retained for older callers and integrations.
export const officialSearchDomains = primarySearchDomains;

export function trustedSearchDomains(overrides?: Record<string, string>) {
  return [...new Set([
    ...primarySearchDomains(overrides),
    ...authoritativeDomains,
    ...professionalDomains,
  ])];
}

function matchesDomain(url: string, domains: string[]) {
  return domains.some((domain) => belongsToWebsite(url, `https://${domain}`));
}

export function sourceTier(url: string, overrides?: Record<string, string>): SourceTier {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password)
      return "untrusted";
    if (matchesDomain(url, primarySearchDomains(overrides))) return "primary";
    if (matchesDomain(url, authoritativeDomains)) return "authoritative";
    if (matchesDomain(url, professionalDomains)) return "professional";
  } catch { /* Invalid and credential-bearing URLs are never trusted. */ }
  return "untrusted";
}

export function sourcePublisher(url: string, overrides?: Record<string, string>) {
  return trustedSearchDomains(overrides)
    .find((domain) => belongsToWebsite(url, `https://${domain}`)) ?? "";
}

export function isOfficialSource(url: string, overrides?: Record<string, string>) {
  return sourceTier(url, overrides) === "primary";
}

export function isTrustedSource(url: string, overrides?: Record<string, string>) {
  return sourceTier(url, overrides) !== "untrusted";
}

import { belongsToWebsite, companyWebsites } from "./identity";

// Explicit publisher domains, never substring matches or media labels supplied
// by a search engine/model. Generic source configuration does not grant trust.
const institutionalDomains = [
  "gov.cn", "sec.gov", "nist.gov", "energy.gov", "europa.eu",
  "cas.cn", "edu.cn", "mit.edu", "stanford.edu", "arxiv.org",
  "ieee.org", "acm.org", "iso.org", "iec.ch",
  "sse.com.cn", "szse.cn", "cninfo.com.cn", "hkexnews.hk",
];
const additionalCompanyDomains = [
  "czy3d.com", "sony.com", "sony-semicon.com", "aramco.com",
  "abb.com", "se.com", "rockwellautomation.com", "honeywell.com",
  "autodesk.com", "ansys.com", "aveva.com", "hexagon.com",
  "microsoft.com", "ibm.com", "aws.amazon.com", "research.google",
];

export function officialSearchDomains(overrides?: Record<string, string>) {
  const websites = [...Object.values(companyWebsites), ...Object.values(overrides ?? {})];
  return [...new Set([
    ...institutionalDomains, ...additionalCompanyDomains,
    ...websites.flatMap((website) => {
      try {
        const url = new URL(website);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password
          ? [url.hostname.replace(/^www\./, "")] : [];
      } catch { return []; }
    }),
  ])];
}

export function isOfficialSource(url: string, overrides?: Record<string, string>) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return false;
    return officialSearchDomains(overrides).some((domain) =>
      belongsToWebsite(url, `https://${domain}`));
  } catch { return false; }
}

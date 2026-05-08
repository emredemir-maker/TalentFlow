// Scraper-related helpers.
//
// `isSafeLinkedInUrl` is the SSRF guard for /api/scrape: only https URLs whose
// hostname is linkedin.com (or any subdomain) are allowed through to puppeteer.
// Raw IPv4/IPv6 literals are rejected so an attacker can't pivot to internal
// services or the cloud metadata endpoint (169.254.169.254).
//
// `handleDirectUrl` (the puppeteer pipeline that actually visits a profile)
// still lives in routes/scrape.js — moving it requires untangling res-coupled
// logic that's easier to extract once the route file exists.
export function isSafeLinkedInUrl(input) {
    if (typeof input !== 'string' || input.length > 2048) return false;
    let parsed;
    try { parsed = new URL(input); } catch { return false; }
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
    return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}

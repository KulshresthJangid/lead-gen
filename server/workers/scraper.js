import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

// ── User-Agent pool ───────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── Per-domain rate limiting (1 req/sec) ─────────────────────────────────────
const lastRequestTime = new Map();

async function throttledGet(url, options = {}) {
  const domain = new URL(url).hostname;
  const last = lastRequestTime.get(domain) || 0;
  const wait = Math.max(0, 1000 - (Date.now() - last));
  if (wait > 0) await delay(wait);
  lastRequestTime.set(domain, Date.now());

  return axios.get(url, {
    timeout: 10_000,
    headers: { 'User-Agent': getRandomUserAgent(), ...options.headers },
    ...options,
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Domain extractor ──────────────────────────────────────────────────────────
function extractDomain(url) {
  try {
    if (!url) return '';
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── GitHub adapter (uses public API — 60 req/hr unauth, 5000/hr with token) ──
function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github.v3+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function scrapeGitHubBios(query = 'developer') {
  const leads = [];
  try {
    const searchRes = await throttledGet('https://api.github.com/search/users', {
      params: { q: query, per_page: 30, type: 'Users' },
      headers: githubHeaders(),
    });

    const users = (searchRes.data?.items || []).slice(0, 30);

    let rateLimited = false;
    for (const user of users) {
      if (rateLimited) break;
      try {
        await delay(500); // be extra polite with GitHub API
        const userRes = await throttledGet(user.url, {
          headers: githubHeaders(),
        });
        const u = userRes.data;

        if (isValidEmail(u.email)) {
          leads.push({
            full_name: u.name || u.login,
            job_title: '',
            company_name: (u.company || '').replace(/^@/, '').trim(),
            company_domain: extractDomain(u.blog || ''),
            email: u.email,
            linkedin_url: '',
            location: u.location || '',
            source: 'github',
          });
        }
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 429) {
          logger.warn({ username: user.login }, 'GitHub rate limited — stopping this query');
          rateLimited = true;
        } else {
          logger.warn({ username: user.login, err: err.message }, 'Failed to fetch GitHub user');
        }
      }
    }

    logger.info({ source: 'github', query, found: leads.length }, 'GitHub scrape complete');
  } catch (err) {
    logger.error({ err: err.message }, 'GitHub search failed');
  }
  return leads;
}

// ── Custom URL adapter (driven by config selector map) ────────────────────────
async function scrapeCustomUrl(url, selectors = {}) {
  const leads = [];
  try {
    let response;
    try {
      response = await throttledGet(url);
    } catch (err) {
      if (err.response?.status === 429 || err.response?.status === 503) {
        await delay(2000);
        response = await throttledGet(url);
      } else {
        throw err;
      }
    }

    const $ = cheerio.load(response.data);
    const s = {
      container: selectors.container || 'body',
      name: selectors.name || '[data-name], .name, .full-name',
      email: selectors.email || '[href^="mailto:"], .email',
      title: selectors.title || '.title, .job-title, [data-title]',
      company: selectors.company || '.company, [data-company]',
    };

    $(s.container).each((_, el) => {
      const name = $(el).find(s.name).first().text().trim();
      const emailEl = $(el).find(s.email).first();
      const rawEmail =
        emailEl.attr('href')?.replace('mailto:', '').trim() ||
        emailEl.text().trim();

      if (name && isValidEmail(rawEmail)) {
        leads.push({
          full_name: name,
          job_title: $(el).find(s.title).first().text().trim(),
          company_name: $(el).find(s.company).first().text().trim(),
          company_domain: extractDomain(url),
          email: rawEmail,
          linkedin_url: '',
          location: '',
          source: `custom:${new URL(url).hostname}`,
        });
      }
    });

    logger.info({ source: 'custom', url, found: leads.length }, 'Custom URL scrape complete');
  } catch (err) {
    logger.error({ url, err: err.message }, 'Custom URL scrape failed');
  }
  return leads;
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Scrape all configured targets.
 * targets: Array<{ url: string, type?: string, selectors?: object, query?: string }>
 */
export async function scrapeLeads(targets = []) {
  const allLeads = [];

  for (const target of targets) {
    try {
      let leads = [];
      if (target.type === 'github' || target.url?.includes('github')) {
        leads = await scrapeGitHubBios(target.query || 'developer location:India followers:>10');
      } else if (target.url) {
        leads = await scrapeCustomUrl(target.url, target.selectors || {});
      }
      allLeads.push(...leads);
    } catch (err) {
      logger.error({ target, err: err.message }, 'Target scrape failed');
    }
  }

  // If no targets configured, run a demo GitHub scrape
  if (targets.length === 0) {
    const demo = await scrapeGitHubBios('developer location:India followers:>10');
    allLeads.push(...demo);
  }

  // Deduplicate within this batch (by email)
  const seen = new Set();
  const deduped = allLeads.filter((lead) => {
    if (!isValidEmail(lead.email) || seen.has(lead.email.toLowerCase())) return false;
    seen.add(lead.email.toLowerCase());
    return true;
  });

  logger.info({ total: allLeads.length, deduped: deduped.length }, 'Scraping complete');
  return deduped;
}

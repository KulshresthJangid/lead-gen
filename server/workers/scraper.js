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

// ── Large query pool — sampled randomly each run so continuous mode never repeats ──
const GITHUB_QUERY_POOL = [
  // ── India: Founders / CTOs ──
  'founder location:India followers:>5',
  'founder location:India followers:>10',
  'CTO location:India followers:>5',
  'CTO location:India repos:>10',
  'cofounder location:India followers:>5',
  'startup location:India followers:>10',
  // ── India: Engineers by city ──
  'developer location:Bangalore followers:>5',
  'developer location:Mumbai followers:>5',
  'developer location:Delhi followers:>5',
  'developer location:Hyderabad followers:>5',
  'developer location:Pune followers:>5',
  'developer location:Chennai followers:>5',
  // ── India: Specialty ──
  'fullstack developer location:India followers:>5',
  'machine learning location:India followers:>5',
  'AI engineer location:India followers:>5',
  'devops location:India repos:>10',
  'freelance developer location:India followers:>5',
  'consultant location:India followers:>10',
  '"building in public" location:India followers:>5',

  // ── USA ──
  'founder location:"United States" SaaS followers:>10',
  'CTO location:"United States" startup followers:>10',
  'cofounder location:"United States" followers:>10',
  'developer location:"San Francisco" followers:>10',
  'developer location:"New York" followers:>10',
  'developer location:"Austin" followers:>5',
  'freelance developer location:"United States" followers:>5',
  'fullstack developer location:"United States" followers:>10',
  'AI engineer location:"United States" followers:>10',
  'startup location:"United States" repos:>10',
  '"looking for developers" location:"United States" followers:>5',

  // ── UK ──
  'founder location:"United Kingdom" startup followers:>5',
  'CTO location:"United Kingdom" followers:>5',
  'developer location:London followers:>5',
  'freelance developer location:"United Kingdom" followers:>5',
  'startup location:"United Kingdom" repos:>10',

  // ── Europe ──
  'founder location:Germany startup followers:>5',
  'developer location:Berlin followers:>5',
  'founder location:Netherlands startup followers:>5',
  'developer location:Amsterdam followers:>5',
  'founder location:France startup followers:>5',
  'developer location:Paris followers:>5',
  'founder location:Spain startup followers:>5',
  'founder location:Poland startup followers:>5',
  'developer location:Warsaw followers:>5',

  // ── Southeast Asia / APAC ──
  'founder location:Singapore startup followers:>5',
  'developer location:Singapore followers:>5',
  'founder location:Australia startup followers:>5',
  'developer location:Sydney followers:>5',
  'developer location:Melbourne followers:>5',
  'founder location:"Hong Kong" followers:>5',
  'founder location:Philippines startup followers:>5',

  // ── Latin America ──
  'founder location:Brazil startup followers:>5',
  'developer location:"São Paulo" followers:>5',
  'founder location:Mexico startup followers:>5',
  'developer location:"Mexico City" followers:>5',
  'founder location:Argentina startup followers:>5',

  // ── Middle East / Africa ──
  'founder location:"United Arab Emirates" startup followers:>5',
  'developer location:Dubai followers:>5',
  'founder location:Nigeria startup followers:>5',
  'developer location:Lagos followers:>5',
  'founder location:Kenya startup followers:>5',

  // ── Global: people hiring / building ──
  'hiring developers followers:>10',
  '"contract developer" followers:>5',
  '"looking for developers" followers:>5',
  '"building a startup" followers:>10',
  'SaaS founder followers:>10',
  'bootstrapped founder followers:>10',
  'indie hacker followers:>10',
  '"open to work" developer followers:>5',
  'freelance developer followers:>10 repos:>10',
  'fullstack developer followers:>20',
  'software consultant followers:>10',
  'AI startup founder followers:>5',
  'product engineer followers:>10',
  'tech lead followers:>10 repos:>10',
];

// ── Runtime pools (AI-generated, refreshed each pipeline run) ────────────────
const runtimeGithubPool = [];
const runtimeGooglePool = [];

export function pushRuntimeQueries({ github = [], google = [] } = {}) {
  runtimeGithubPool.length = 0;
  runtimeGithubPool.push(...github);
  runtimeGooglePool.length = 0;
  runtimeGooglePool.push(...google);
  _shuffledPool = null; // force reshuffle so AI queries are included
}

const queryPageCursor = new Map();
const MAX_GITHUB_PAGE = 20;

function getNextPage(query) {
  const page = ((queryPageCursor.get(query) || 0) % MAX_GITHUB_PAGE) + 1;
  queryPageCursor.set(query, page);
  return page;
}

let _poolIndex = 0;
let _shuffledPool = null;

function pickNextQueries(n = 10) {
  const combined = [...GITHUB_QUERY_POOL, ...runtimeGithubPool];
  if (!_shuffledPool || _poolIndex >= _shuffledPool.length) {
    _shuffledPool = [...combined].sort(() => Math.random() - 0.5);
    _poolIndex = 0;
    logger.info({ poolSize: _shuffledPool.length }, '[SCRAPER] Query pool cycled — reshuffling');
  }
  const batch = _shuffledPool.slice(_poolIndex, Math.min(_poolIndex + n, _shuffledPool.length));
  _poolIndex += batch.length;
  return batch;
}

async function scrapeGitHubBios(query = 'developer') {
  const leads = [];
  try {
    // Sequential page cursor — advances 1→20→1… per query so we systematically
    // cover 600 users per query instead of randomly re-hitting the same results.
    const page = getNextPage(query);
    const searchRes = await throttledGet('https://api.github.com/search/users', {
      params: { q: query, per_page: 30, page, type: 'Users' },
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

// ── HackerNews "Who wants to be hired?" adapter ───────────────────────────────
// Fetches the latest monthly thread and parses ALL comments (paginated) for emails.
async function scrapeHackerNews(keywordFilter = '') {
  const leads = [];
  try {
    // Sort by date so we always get the current month's thread
    const searchRes = await throttledGet(
      'https://hn.algolia.com/api/v1/search_by_date?query=who+wants+to+be+hired&tags=ask_hn&hitsPerPage=1',
    );
    const story = searchRes.data?.hits?.[0];
    if (!story) return leads;

    const storyId = story.objectID;

    // Algolia paginates comments — fetch up to 3 pages of 200 to get ~600 comments
    let comments = [];
    for (let page = 0; page < 3; page++) {
      const pageRes = await throttledGet(
        `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=200&page=${page}`,
      );
      const hits = pageRes.data?.hits || [];
      if (!hits.length) break;
      comments.push(...hits);
      if (hits.length < 200) break;
    }

    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    for (const comment of comments) {
      const text = (comment.comment_text || comment.text || '').replace(/<[^>]+>/g, ' ');
      if (!text) continue;
      if (keywordFilter && !text.toLowerCase().includes(keywordFilter.toLowerCase())) continue;

      const emails = text.match(emailRegex) || [];
      if (!emails.length) continue;

      const locationMatch = text.match(/Location:\s*([^\n|<]+)/i);
      const remoteMatch   = text.match(/Remote:\s*([^\n|<]+)/i);
      const techsMatch    = text.match(/(?:Tech(?:nologies)?|Stack):\s*([^\n|<]+)/i);
      const roleMatch     = text.match(/(?:Role|Title|Position|Seeking):\s*([^\n|<]+)/i);

      for (const email of emails) {
        if (!isValidEmail(email)) continue;
        leads.push({
          full_name: comment.author || '',
          job_title: roleMatch ? roleMatch[1].trim().slice(0, 80) : techsMatch ? techsMatch[1].trim().slice(0, 80) : '',
          company_name: '',
          company_domain: '',
          email,
          linkedin_url: '',
          location: locationMatch ? locationMatch[1].trim() : remoteMatch ? remoteMatch[1].trim() : '',
          source: 'hackernews',
        });
        break; // one lead per comment (take first valid email)
      }
    }

    logger.info({ source: 'hackernews', storyId, found: leads.length }, 'HN scrape complete');
  } catch (err) {
    logger.error({ err: err.message }, 'HackerNews scrape failed');
  }
  return leads;
}

// ── GitLab adapter (public API, no token needed) ──────────────────────────────
async function scrapeGitLab(query = 'developer') {
  const leads = [];
  try {
    const searchRes = await throttledGet('https://gitlab.com/api/v4/users', {
      params: { search: query, per_page: 20 },
    });

    const users = searchRes.data || [];

    for (const user of users) {
      try {
        await delay(300);
        const userRes = await throttledGet(`https://gitlab.com/api/v4/users/${user.id}`);
        const u = userRes.data;

        if (isValidEmail(u.public_email || '')) {
          leads.push({
            full_name: u.name || u.username,
            job_title: u.job_title || '',
            company_name: u.organization || '',
            company_domain: extractDomain(u.website_url || ''),
            email: u.public_email,
            linkedin_url: '',
            location: u.location || '',
            source: 'gitlab',
          });
        }
      } catch (err) {
        logger.warn({ username: user.username, err: err.message }, 'Failed to fetch GitLab user');
      }
    }

    logger.info({ source: 'gitlab', query, found: leads.length }, 'GitLab scrape complete');
  } catch (err) {
    logger.error({ err: err.message }, 'GitLab scrape failed');
  }
  return leads;
}

// ── Google Custom Search adapter ─────────────────────────────────────────────
// Needs: GOOGLE_CSE_KEY (API key) + GOOGLE_CSE_CX (Search Engine ID)
async function scrapeGoogle(query = 'site:linkedin.com/in founder India SaaS') {
  const leads = [];
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;

  if (!key || !cx) {
    logger.warn('Google CSE skipped — GOOGLE_CSE_KEY or GOOGLE_CSE_CX not set in .env');
    return leads;
  }

  try {
    // Google CSE allows max 10 results per request; use start=1,11,21 for up to 30
    for (let start = 1; start <= 21; start += 10) {
      const res = await throttledGet('https://www.googleapis.com/customsearch/v1', {
        params: { key, cx, q: query, num: 10, start },
      });

      const items = res.data?.items || [];
      if (!items.length) break;

      for (const item of items) {
        const link = item.link || '';
        const title = item.title || '';
        const snippet = item.snippet || '';

        // Extract email from snippet if present
        const emailMatch = snippet.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);

        // Infer name: Google title for LinkedIn is usually "FirstName LastName - Title | LinkedIn"
        const namePart = title.split(/[-|–]/)[0].trim();
        const titlePart = title.split(/[-|–]/)[1]?.split(/[|·]/)[0]?.trim() || '';

        leads.push({
          full_name: namePart,
          job_title: titlePart,
          company_name: '',
          company_domain: '',
          email: isValidEmail(emailMatch?.[0] || '') ? emailMatch[0] : '',
          linkedin_url: link.includes('linkedin.com/in') ? link : '',
          location: '',
          source: 'google',
        });
      }

      if (items.length < 10) break; // no more pages
    }

    logger.info({ source: 'google', query, found: leads.length }, 'Google CSE scrape complete');
  } catch (err) {
    if (err.response?.status === 429) {
      logger.warn('Google CSE daily quota (100 queries) exceeded');
    } else {
      logger.error({ err: err.message }, 'Google CSE scrape failed');
    }
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
 * Strategy:
 *  - GitHub: consolidate ALL github targets, pick 12 unique queries per run
 *            from combined pool (target queries + sequential cursor pool).
 *  - HackerNews: one call per unique keyword filter.
 *  - Google CSE: target queries + AI runtime queries (up to 15 total).
 *  - GitLab / Custom: each target individually.
 */
export async function scrapeLeads(targets = []) {
  const allLeads = [];

  const githubTargets = targets.filter(
    t => t.type === 'github' || t.url?.includes('github.com'),
  );
  const hnTargets = targets.filter(
    t => t.type === 'hackernews' || t.url?.includes('news.ycombinator.com'),
  );
  const googleTargets = targets.filter(t => t.type === 'google');
  const gitlabTargets = targets.filter(
    t => t.type === 'gitlab' || t.url?.includes('gitlab.com'),
  );
  const customTargets = targets.filter(t => {
    if (!t.url) return false;
    if (['github', 'hackernews', 'google', 'gitlab'].includes(t.type)) return false;
    if (t.url.includes('github.com') || t.url.includes('news.ycombinator.com') || t.url.includes('gitlab.com')) return false;
    return true;
  });

  // GitHub: unified pool, 12 unique queries per run
  if (githubTargets.length > 0 || targets.length === 0) {
    const targetQueries = githubTargets.map(t => t.query).filter(Boolean);
    const slotsFree = Math.max(2, 12 - targetQueries.length);
    const poolQueries = pickNextQueries(slotsFree);
    const queries = [...new Set([...targetQueries, ...poolQueries])];
    logger.info({ count: queries.length }, '[SCRAPER] GitHub queries this run');
    for (const q of queries) {
      const batch = await scrapeGitHubBios(q);
      allLeads.push(...batch);
    }
  }

  // HackerNews: one call per unique keyword filter
  const hnKeywords = hnTargets.length > 0
    ? [...new Set(hnTargets.map(t => t.query || ''))]
    : (targets.length === 0 ? [''] : []);
  for (const keyword of hnKeywords) {
    const batch = await scrapeHackerNews(keyword);
    allLeads.push(...batch);
  }

  // Google CSE: target queries + AI runtime queries
  if (googleTargets.length > 0 || runtimeGooglePool.length > 0) {
    const targetQueries = googleTargets.map(t => t.query).filter(Boolean);
    const combined = [...new Set([...targetQueries, ...runtimeGooglePool])];
    logger.info({ count: combined.length }, '[SCRAPER] Google CSE queries this run');
    for (const q of combined.slice(0, 15)) {
      const batch = await scrapeGoogle(q);
      allLeads.push(...batch);
    }
  }

  // GitLab: each target individually
  for (const t of gitlabTargets) {
    const batch = await scrapeGitLab(t.query || 'developer');
    allLeads.push(...batch);
  }

  // Custom URLs: each target individually
  for (const t of customTargets) {
    const batch = await scrapeCustomUrl(t.url, t.selectors || {});
    allLeads.push(...batch);
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

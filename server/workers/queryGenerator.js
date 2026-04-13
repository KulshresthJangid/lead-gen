import logger from '../utils/logger.js';
import { callAI } from '../utils/aiClient.js';

const GITHUB_FALLBACK = [
  'remote software engineer SaaS followers:>10',
  'founder bootstrapped startup followers:>10',
  'CTO "series A" startup followers:>10',
  'freelance developer "open to work" followers:>5',
  'indie hacker "building in public" followers:>5',
  'developer fintech startup location:India followers:>10',
  'AI engineer startup followers:>10',
  'tech lead "looking for developers" followers:>5',
  'fullstack developer remote repos:>20 followers:>10',
  'product engineer startup followers:>15',
  'software consultant followers:>10 repos:>10',
  'cofounder SaaS platform followers:>10',
];

const GOOGLE_FALLBACK = [
  'site:linkedin.com/in founder "looking for developers" SaaS',
  'site:linkedin.com/in CTO startup "series A" 2025',
  'site:linkedin.com/in "head of engineering" startup hiring',
  'site:linkedin.com/in "technical co-founder" hiring developers',
  'site:linkedin.com/in founder bootstrapped SaaS platform',
  'site:linkedin.com/in "VP Engineering" startup',
  'site:linkedin.com/in founder "building" software startup India',
  'site:linkedin.com/in CTO "looking for" engineers',
];

export async function generateGitHubQueries(config = {}) {
  const product = (config.product_description || '').trim();
  const icp = (config.icp_description || '').trim();

  if (!product && !icp) {
    logger.debug('[QUERY-GEN] No ICP/product set — using fallback GitHub queries');
    return GITHUB_FALLBACK;
  }

  const prompt = `You are a B2B lead generation expert. Generate 12 diverse GitHub user search queries to find potential customers for this product.

Product: ${product}
Ideal Customer Profile: ${icp}

GitHub search syntax rules:
- Combine keyword terms with field:value pairs
- Fields: location:"City Name", location:Country, followers:>N, repos:>N
- Keyword examples: founder, CTO, developer, engineer, freelance, indie, SaaS, startup, consultant
- Mix different roles, locations, company stages, and follower counts
- Make ALL 12 queries distinct from each other

Output ONLY a valid JSON array of 12 query strings, no explanation, no markdown:
["query1","query2","query3",...]`;

  try {
    const { text } = await callAI(prompt, config, { temperature: 0.9, maxTokens: 600, timeout: 30_000 });
    const match = text.match(/\[([\s\S]*?)\]/);
    if (!match) throw new Error('No JSON array in response');

    const queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('Empty array');

    const valid = queries.filter(q => typeof q === 'string' && q.length > 5).slice(0, 15);
    logger.info({ count: valid.length }, '[QUERY-GEN] AI generated GitHub queries');
    return valid;
  } catch (err) {
    logger.warn({ err: err.message }, '[QUERY-GEN] GitHub query generation failed — using fallbacks');
    return GITHUB_FALLBACK;
  }
}

// ── AI expansion: generate NEW queries based on enabled sources + campaign context ──────────────
// Called each pipeline run. Takes existing (manual + previously AI-generated) queries as seeds
// so it always produces fresh, non-overlapping batches.
export async function expandQueriesFromSources(config = {}, sources = [], previousAiQueries = []) {
  const product  = (config.product_description || '').trim();
  const icp      = (config.icp_description     || '').trim();

  if (!product && !icp) return { github: [], google: [], gitlab: [] };

  // Group sources by type and collect existing queries for each
  const byType = {};
  for (const s of sources) {
    if (!byType[s.type]) byType[s.type] = [];
    if (s.query) byType[s.type].push(s.query);
  }
  const prevByType = {};
  for (const q of previousAiQueries) {
    if (!prevByType[q.type]) prevByType[q.type] = [];
    if (q.query) prevByType[q.type].push(q.query);
  }

  const result = { github: [], google: [], gitlab: [] };

  async function expandForType(type, syntaxHint, formatHint) {
    const existing = [...(byType[type] || []), ...(prevByType[type] || [])];
    const avoidBlock = existing.length
      ? `\nAlready used — DO NOT repeat these:\n${existing.map(q => `- "${q}"`).join('\n')}\n`
      : '';

    const prompt = `You are a B2B lead generation expert expanding a ${type} search campaign.

Product: ${product}
Ideal Customer Profile: ${icp}
${avoidBlock}
Generate 10 NEW diverse ${type} search queries that find DIFFERENT prospect segments not yet covered.
${syntaxHint}

Output ONLY a valid JSON array of 10 query strings, no explanation, no markdown:
${formatHint}`;

    try {
      const { text } = await callAI(prompt, config, { temperature: 0.95, maxTokens: 600, timeout: 30_000 });
      const match = text.match(/\[([\s\S]*?)\]/);
      if (!match) throw new Error('No JSON array in response');
      const queries = JSON.parse(match[0]);
      return queries.filter(q => typeof q === 'string' && q.length > 5).slice(0, 12);
    } catch (err) {
      logger.warn({ err: err.message }, `[QUERY-GEN] ${type} expansion failed`);
      return [];
    }
  }

  const tasks = [];

  if (byType.github) {
    tasks.push(expandForType(
      'github',
      'GitHub search syntax: combine role keywords (founder, CTO, engineer, freelance, indie) with location:"City", followers:>N, repos:>N',
      '["CEO startup India followers:>10","..."]',
    ).then(qs => { result.github = qs; }));
  }

  if (byType.google) {
    tasks.push(expandForType(
      'google',
      'Every query MUST start with "site:linkedin.com/in". Target: founders, CTOs, VPs, heads of engineering, product managers. Mix industries, company stages, geographies.',
      '["site:linkedin.com/in founder SaaS 2025","..."]',
    ).then(qs => { result.google = qs; }));
  }

  if (byType.gitlab) {
    tasks.push(expandForType(
      'gitlab',
      'GitLab search terms: role keywords, tech stack words, or partial names. Shorter is better.',
      '["devops startup","backend engineer","..."]',
    ).then(qs => { result.gitlab = qs; }));
  }

  await Promise.all(tasks);

  const total = result.github.length + result.google.length + result.gitlab.length;
  logger.info({ total, byType: Object.fromEntries(Object.entries(result).filter(([,v]) => v.length)) }, '[QUERY-GEN] Source-based expansion done');

  return result;
}

export async function generateGoogleQueries(config = {}) {
  const product = (config.product_description || '').trim();
  const icp = (config.icp_description || '').trim();

  if (!product && !icp) {
    logger.debug('[QUERY-GEN] No ICP/product set — using fallback Google queries');
    return GOOGLE_FALLBACK;
  }

  const prompt = `You are a B2B lead generation expert. Generate 8 Google search queries to find decision-makers on LinkedIn.

Product: ${product}
Ideal Customer Profile: ${icp}

Rules:
- Every query MUST start with "site:linkedin.com/in"
- Target: founders, CTOs, VPs, heads of engineering, product managers
- Mix different industries, company stages, and geographies
- Make each query distinct

Output ONLY a valid JSON array of 8 query strings, no markdown:
["site:linkedin.com/in query1","site:linkedin.com/in query2",...]`;

  try {
    const { text } = await callAI(prompt, config, { temperature: 0.9, maxTokens: 400, timeout: 25_000 });
    const match = text.match(/\[([\s\S]*?)\]/);
    if (!match) throw new Error('No JSON array in response');

    const queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('Empty array');

    const valid = queries.filter(q => typeof q === 'string' && q.length > 5).slice(0, 10);
    logger.info({ count: valid.length }, '[QUERY-GEN] AI generated Google queries');
    return valid;
  } catch (err) {
    logger.warn({ err: err.message }, '[QUERY-GEN] Google query generation failed — using fallbacks');
    return GOOGLE_FALLBACK;
  }
}

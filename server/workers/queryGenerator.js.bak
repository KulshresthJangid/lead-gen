import axios from 'axios';
import logger from '../utils/logger.js';

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
  const endpoint = config.ollama_endpoint || 'http://localhost:11434';
  const model = config.ollama_model || 'mistral';
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
    const res = await axios.post(`${endpoint}/api/generate`, {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.9, num_predict: 600 },
    }, { timeout: 30_000 });

    const raw = (res.data?.response || '').trim();
    const match = raw.match(/\[[\s\S]*?\]/);
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

export async function generateGoogleQueries(config = {}) {
  const endpoint = config.ollama_endpoint || 'http://localhost:11434';
  const model = config.ollama_model || 'mistral';
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
    const res = await axios.post(`${endpoint}/api/generate`, {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.9, num_predict: 400 },
    }, { timeout: 25_000 });

    const raw = (res.data?.response || '').trim();
    const match = raw.match(/\[[\s\S]*?\]/);
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

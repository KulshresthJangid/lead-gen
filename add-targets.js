// ============================================================
// AUTO-ADD SOURCES — paste in browser DevTools console
// Open the campaign modal FIRST, then paste this whole block.
// ============================================================

(async () => {

// ── Source list ──────────────────────────────────────────────
// type values must match the modal's <select> option values:
//   github | google | gitlab | hackernews | custom
// For type "custom" use the "url" key; all others use "query".

const SOURCES = [

  // ── GITHUB ──────────────────────────────────────────────
  { type: 'github', query: `founder "hiring" "full stack" OR "fullstack"` },
  { type: 'github', query: `"hiring engineers" OR "open roles" startup` },
  { type: 'github', query: `"hiring" "backend developer" OR "backend engineer"` },
  { type: 'github', query: `"hiring" "frontend developer" OR "react developer"` },
  { type: 'github', query: `"hiring" "node.js" OR "nodejs" developer remote` },
  { type: 'github', query: `cto "hiring" OR "we are hiring" remote` },
  { type: 'github', query: `"we're hiring" "seed" OR "series a" startup` },
  { type: 'github', query: `"join our team" "engineer" startup 2024` },
  { type: 'github', query: `"open positions" "software engineer" seed funded` },
  { type: 'github', query: `"we are hiring" "python" OR "django" startup` },
  { type: 'github', query: `"hiring" "devops" OR "infrastructure" startup remote` },
  { type: 'github', query: `"careers" "software" "series b" OR "series a"` },
  { type: 'github', query: `"hiring" "mobile developer" OR "ios" OR "android" startup` },
  { type: 'github', query: `"we're growing" "engineering team" remote` },
  { type: 'github', query: `"technical roles" "saas" startup hiring` },

  // ── GOOGLE (LinkedIn CSE) ────────────────────────────────
  { type: 'google', query: `founder location:India followers:>10` },
  { type: 'google', query: `"head of marketing" D2C brand India` },
  { type: 'google', query: `"performance marketing" "D2C" OR "direct to consumer" founder` },
  { type: 'google', query: `"ecommerce" "founder" "shopify" India hiring` },
  { type: 'google', query: `"CMO" OR "VP marketing" D2C skincare OR supplements` },
  { type: 'google', query: `"growth marketer" "paid ads" D2C brand` },
  { type: 'google', query: `"meta ads" OR "facebook ads" "D2C" brand founder` },
  { type: 'google', query: `"shopify" founder "series a" OR "seed" India` },
  { type: 'google', query: `"direct to consumer" brand "scaling" "paid media"` },
  { type: 'google', query: `"marketing lead" "ecommerce" brand India 2024` },
  { type: 'google', query: `"performance marketing manager" D2C brand` },
  { type: 'google', query: `"growth" "D2C" "ROAS" brand founder India` },
  { type: 'google', query: `"brand founder" "consumer goods" India funding` },
  { type: 'google', query: `"ecommerce brand" "hiring" "performance" India` },
  { type: 'google', query: `"we are hiring" "digital marketing" D2C India` },

  // ── HACKER NEWS ─────────────────────────────────────────
  { type: 'hackernews', query: `ecommerce OR D2C OR "direct to consumer"` },
  { type: 'hackernews', query: `"performance marketing" remote` },
  { type: 'hackernews', query: `shopify OR "consumer brand"` },
  { type: 'hackernews', query: `ecommerce brand shopify` },
  { type: 'hackernews', query: `D2C OR "direct to consumer" product` },
  { type: 'hackernews', query: `"paid ads" OR "meta ads" OR "google ads"` },
  { type: 'hackernews', query: `growth consumer startup remote` },
  { type: 'hackernews', query: `marketing saas OR consumer 2024` },
  { type: 'hackernews', query: `"performance marketing" OR "paid media"` },
  { type: 'hackernews', query: `brand "series a" OR seed remote` },
  { type: 'hackernews', query: `growing ecommerce OR "online store"` },
  { type: 'hackernews', query: `"media buyer" OR "growth marketer"` },
  { type: 'hackernews', query: `acquisition consumer startup` },
  { type: 'hackernews', query: `"tiktok ads" OR "instagram ads" brand` },
  { type: 'hackernews', query: `supplement OR skincare OR fashion launched` },

  // ── GITLAB ──────────────────────────────────────────────
  { type: 'gitlab', query: `"hiring" "frontend" OR "backend" "saas" startup` },
  { type: 'gitlab', query: `"we are hiring" "engineer" remote startup` },
  { type: 'gitlab', query: `"open roles" "software engineer" "series a"` },
  { type: 'gitlab', query: `"join our team" "engineering" startup 2024` },
  { type: 'gitlab', query: `"hiring" "react" OR "vue" OR "angular" startup remote` },
  { type: 'gitlab', query: `"careers" "engineer" seed funded startup` },
  { type: 'gitlab', query: `"we're hiring" "python" OR "golang" startup` },
  { type: 'gitlab', query: `"open positions" "devops" OR "sre" startup hiring` },
  { type: 'gitlab', query: `"hiring" "mobile" OR "ios" OR "android" startup remote` },
  { type: 'gitlab', query: `cto "hiring" "full stack" startup 2024` },

  // ── CUSTOM URL ───────────────────────────────────────────
  { type: 'custom', url: `https://wellfound.com/jobs?role=marketing&remote=true` },
  { type: 'custom', url: `https://wellfound.com/jobs?role=growth&remote=true` },
  { type: 'custom', url: `https://wellfound.com/companies?market=e-commerce` },
  { type: 'custom', url: `https://www.ycombinator.com/companies?industry=Consumer+Products` },
  { type: 'custom', url: `https://www.ycombinator.com/jobs#f=marketing` },
  { type: 'custom', url: `https://remoteok.com/remote-marketing-jobs` },
  { type: 'custom', url: `https://remoteok.com/remote-growth-jobs` },
  { type: 'custom', url: `https://jobs.ashbyhq.com/?department=Marketing` },
  { type: 'custom', url: `https://www.linkedin.com/jobs/search/?keywords=performance+marketing+D2C` },
  { type: 'custom', url: `https://clutch.co/agencies/digital-marketing/ecommerce` },
];

// ── Helpers ──────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

// React's controlled inputs ignore direct .value assignment.
// Use the native prototype setter, then dispatch the right event.
const nativeInputSetter  = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,  'value').set;
const nativeSelectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;

function setReactInput(el, value) {
  nativeInputSetter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setReactSelect(el, value) {
  nativeSelectSetter.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Find the "Add source" button inside the open modal
function getAddBtn() {
  return [...document.querySelectorAll('button[type="button"]')]
    .find(b => b.textContent.trim() === 'Add source');
}

// Source-type <select> elements are the ones whose options include "github"
function getSourceSelects() {
  return [...document.querySelectorAll('select')]
    .filter(s => [...s.options].some(o => o.value === 'github'));
}

// ── Runner ───────────────────────────────────────────────────

async function addSources() {
  const addBtn = getAddBtn();
  if (!addBtn) { console.error('Could not find "Add source" button. Is the campaign modal open?'); return; }

  for (let i = 0; i < SOURCES.length; i++) {
    const { type, query, url } = SOURCES[i];

    // Click "+ Add source"
    addBtn.click();
    await sleep(300);

    // The new select is always the last one in the list
    const selects = getSourceSelects();
    const sel = selects[selects.length - 1];
    if (!sel) { console.warn(`[${i+1}] No select found, skipping.`); continue; }

    // Set the source type
    setReactSelect(sel, type);
    await sleep(150);

    // The input sits in the same container div as the select
    const row = sel.closest('div');
    const input = row?.querySelector('input');
    if (!input) { console.warn(`[${i+1}] No input found for type="${type}", skipping.`); continue; }

    // Custom type uses the url field; all others use query
    setReactInput(input, type === 'custom' ? url : query);

    console.log(`[${i+1}/${SOURCES.length}] ${type} → ${(type === 'custom' ? url : query).slice(0, 70)}`);
    await sleep(150);
  }

  console.log(`Done! Added ${SOURCES.length} sources.`);
}

addSources();

})();

const targets = [
  // ── GitHub ──────────────────────────────────────────────────────────────────
  { name: "GitHub - SaaS Founders India", type: "github", query: "saas founder location:India followers:>50" },
  { name: "GitHub - Startup CTOs India", type: "github", query: "cto startup location:India followers:>20" },
  { name: "GitHub - Indie Hackers India", type: "github", query: "indie hacker location:India followers:>10" },
  { name: "GitHub - Engineers Bangalore", type: "github", query: "engineer location:\"Bangalore\" followers:>30" },
  { name: "GitHub - Founders UK", type: "github", query: "founder location:\"United Kingdom\" followers:>50" },
  { name: "GitHub - Startup Founders US", type: "github", query: "founder startup location:\"United States\" followers:>100" },
  { name: "GitHub - Open Source Founders", type: "github", query: "ceo open-source location:India followers:>30" },
  { name: "GitHub - B2B SaaS Builders", type: "github", query: "b2b saas location:India followers:>20" },

  // ── HackerNews ──────────────────────────────────────────────────────────────
  { name: "HN - Who Wants to Be Hired (India)", type: "hackernews", query: "India" },
  { name: "HN - Who Wants to Be Hired (Remote)", type: "hackernews", query: "remote" },
  { name: "HN - Who Wants to Be Hired (SaaS)", type: "hackernews", query: "SaaS" },
  { name: "HN - Who Wants to Be Hired (Startup)", type: "hackernews", query: "startup" },
  { name: "HN - Who Wants to Be Hired (Full-Stack)", type: "hackernews", query: "full-stack" },
  { name: "HN - Who Wants to Be Hired (Founder)", type: "hackernews", query: "founder" },

  // ── Google Custom Search ─────────────────────────────────────────────────────
  { name: "Google - SaaS Founders India LinkedIn", type: "google", query: 'site:linkedin.com/in "founder" "India" "SaaS"' },
  { name: "Google - Startup CEOs India LinkedIn", type: "google", query: 'site:linkedin.com/in "CEO" "startup" "India"' },
  { name: "Google - CTOs Hiring India LinkedIn", type: "google", query: 'site:linkedin.com/in "CTO" "hiring" "India" "B2B"' },
  { name: "Google - Hiring Startups India", type: "google", query: '"startup hiring developers" India OR "we are hiring engineers" startup India' },
  { name: "Google - Building in Public India", type: "google", query: '"building in public" India SaaS B2B founder 2024 OR 2025' },
  { name: "Google - Product Hunt Makers India", type: "google", query: 'site:producthunt.com "India" "maker" SaaS' },
  { name: "Google - AngelList Founders India", type: "google", query: 'site:wellfound.com "India" "founder" "SaaS"' },
  { name: "Google - Indie Hackers Revenue", type: "google", query: 'site:indiehackers.com "India" "$" revenue OR "MRR"' },
  { name: "Google - YC Founders India", type: "google", query: 'site:ycombinator.com "India" "founder" software' },
  { name: "Google - Dev.to Founders India", type: "google", query: 'site:dev.to "founder" OR "CTO" "India" SaaS startup' },
  { name: "Google - Medium Founders India", type: "google", query: 'site:medium.com "founder" "India" "SaaS" "startup" lessons learned' },
  { name: "Google - Substack Startup India", type: "google", query: 'site:substack.com "India" "startup" "founder" newsletter' },
  { name: "Google - LinkedIn SaaS SE Asia", type: "google", query: 'site:linkedin.com/in "founder" "Singapore" OR "Vietnam" OR "Philippines" "SaaS"' },
  { name: "Google - LinkedIn Founders MENA", type: "google", query: 'site:linkedin.com/in "founder" "UAE" OR "Dubai" OR "Saudi" "SaaS"' },

  // ── GitLab ───────────────────────────────────────────────────────────────────
  { name: "GitLab - Founders India", type: "gitlab", query: "founder India saas" },
  { name: "GitLab - CTO Startup", type: "gitlab", query: "cto startup b2b" },
];

// 🔴 CRITICAL: native setter for React inputs
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value').set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else {
    valueSetter.call(element, value);
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function run() {
  const addBtn = [...document.querySelectorAll("button")]
    .find(btn => btn.innerText.includes("Add Target"));

  if (!addBtn) {
    console.error("❌ Add Target button not found — make sure you're on the Settings page");
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    addBtn.click();
    await sleep(400);

    const rows = document.querySelectorAll(".space-y-2 > div");
    const row = rows[rows.length - 1];
    const inputs = row.querySelectorAll("input");
    const select = row.querySelector("select");

    // Set source name
    setNativeValue(inputs[0], target.name);

    // Set type dropdown
    select.value = target.type;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);

    // Re-query inputs after type change (custom URL field may appear, shifting index)
    const inputs2 = row.querySelectorAll("input");
    setNativeValue(inputs2[inputs2.length - 1], target.query);

    console.log(`✅ [${i + 1}/${targets.length}] ${target.name}`);
    await sleep(200);
  }

  console.log("🎉 All targets added! Click Save Settings.");
}

run();

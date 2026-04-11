// ── AboutPage — editorial product story page ──────────────────────────────────

// ── SVG pipeline diagram with animated dashes ─────────────────────────────────
function PipelineDiagram() {
  const stages = [
    { id: 'scrape', label: 'Scrape',       icon: '🕷️', desc: 'GitHub · HackerNews · GitLab · Google' },
    { id: 'dedup',  label: 'Deduplicate',  icon: '🔍', desc: 'SHA-256 + Levenshtein fuzzy match'     },
    { id: 'enrich', label: 'Enrich',       icon: '🧠', desc: 'Ollama LLM — pain points + context'    },
    { id: 'score',  label: 'Score',        icon: '🎯', desc: 'Hot · Warm · Cold classification'       },
    { id: 'reach',  label: 'Outreach',     icon: '✉️', desc: 'AI-drafted personalised message'        },
  ];

  return (
    <section>
      <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.10em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '28px' }}>
        How it works
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '8px', gap: 0 }}>
        {stages.map((stage, i) => (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Stage node */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '112px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '12px',
                background: 'var(--card)', border: '1px solid var(--border-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
                boxShadow: '0 0 0 1px var(--border), 0 4px 16px rgba(99,102,241,0.10)',
                transition: 'border-color 200ms, box-shadow 200ms',
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-muted)';
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent-muted), 0 4px 16px rgba(99,102,241,0.20)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-md)';
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--border), 0 4px 16px rgba(99,102,241,0.10)';
                }}
              >
                {stage.icon}
              </div>
              <div style={{ textAlign: 'center', padding: '0 4px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px' }}>
                  {stage.label}
                </p>
                <p style={{ fontSize: '10px', color: 'var(--text-3)', lineHeight: 1.45, margin: 0 }}>
                  {stage.desc}
                </p>
              </div>
            </div>

            {/* Animated SVG connector */}
            {i < stages.length - 1 && (
              <svg width="36" height="2" style={{ flexShrink: 0, marginBottom: '42px', overflow: 'visible' }}>
                <line
                  x1="0" y1="1" x2="36" y2="1"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                  style={{ animation: 'dashAnimate 1.1s linear infinite' }}
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Built-with data ───────────────────────────────────────────────────────────
const BUILT_WITH = [
  { name: 'Ollama',       desc: 'Local LLM inference — Mistral, Mixtral, Llama', icon: '🤖', href: 'https://ollama.com' },
  { name: 'RabbitMQ',     desc: 'Async pipeline queue — scrape & enrich workers', icon: '🐇', href: 'https://www.rabbitmq.com' },
  { name: 'Socket.io',    desc: 'Real-time lead arrivals without polling',         icon: '⚡', href: 'https://socket.io' },
  { name: 'GitHub API',   desc: 'Developer profile scraping at scale',            icon: '🐙', href: 'https://docs.github.com/en/rest' },
  { name: 'HackerNews',   desc: '"Who wants to be hired" thread parsing',         icon: '🧡', href: 'https://news.ycombinator.com' },
  { name: 'React + Vite', desc: 'Fast, minimal frontend — no SSR needed',         icon: '⚛️', href: 'https://vitejs.dev' },
];

// ── More tools section data ───────────────────────────────────────────────────
const MORE_TOOLS = [
  { name: 'buildwithkulshresth.com', desc: 'All projects in one place', href: 'https://buildwithkulshresth.com' },
];

// ── AboutPage ─────────────────────────────────────────────────────────────────
export default function AboutPage() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '36px 0 96px' }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '72px' }}>
        {/* Version badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '24px',
          padding: '3px 10px', borderRadius: '20px',
          border: '1px solid var(--accent-muted)', backgroundColor: 'var(--accent-subtle)',
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent)',
            animation: 'pulsePing 2s ease-in-out infinite',
            display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.05em' }}>
            v0.1.0 — MVP
          </span>
        </div>

        {/* Product name — large editorial treatment */}
        <h1 style={{
          fontSize: 'clamp(64px, 10vw, 96px)',
          fontWeight: 900, letterSpacing: '-4px', lineHeight: 0.92,
          color: 'var(--text-1)', fontFamily: 'var(--font-display)', margin: 0,
        }}>
          Drip
        </h1>

        {/* Tagline */}
        <p style={{ fontSize: '20px', color: 'var(--text-2)', marginTop: '20px', letterSpacing: '-0.4px', fontWeight: 300, lineHeight: 1.3 }}>
          Autonomous leads.{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Zero manual effort.</span>
        </p>

        {/* Description */}
        <p style={{ fontSize: '14px', color: 'var(--text-3)', marginTop: '14px', maxWidth: '520px', lineHeight: 1.75 }}>
          Drip autonomously scrapes GitHub, HackerNews, and GitLab for active founders and
          engineers — enriches each contact with AI-generated pain points and personalised
          outreach reasons — then scores them <span style={{ color: 'var(--hot)', fontWeight: 600 }}>hot</span> ·{' '}
          <span style={{ color: 'var(--warm)', fontWeight: 600 }}>warm</span> ·{' '}
          <span style={{ color: 'var(--cold)', fontWeight: 600 }}>cold</span>.
          Runs continuously, no human in the loop.
        </p>
      </section>

      {/* ── Pipeline diagram ─────────────────────────────────────────────── */}
      <PipelineDiagram />

      {/* ── Built with ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: '64px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.10em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '20px' }}>
          Built with
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {BUILT_WITH.map(({ name, desc, icon, href }) => (
            <a
              key={name} href={href} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', flexDirection: 'column', gap: '6px',
                padding: '14px 16px', borderRadius: '10px',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                textDecoration: 'none', transition: 'border-color 150ms, background-color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-muted)';
                e.currentTarget.style.backgroundColor = 'var(--hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.backgroundColor = 'var(--card)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{name}</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Creator ──────────────────────────────────────────────────────── */}
      <section style={{
        marginTop: '56px', padding: '28px 28px 24px',
        borderRadius: '14px', border: '1px solid var(--border-md)',
        backgroundColor: 'var(--card)', position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient indigo orb */}
        <div style={{
          position: 'absolute', top: '-50px', right: '-50px',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
          pointerEvents: 'none', animation: 'indigo-orb 4s ease-in-out infinite',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'var(--accent)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
            boxShadow: '0 0 20px rgba(99,102,241,0.40)',
          }}>
            👤
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>
              Kulshresth Jangid
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0 }}>
              Builder · Indie Hacker · Developer
            </p>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 20px', lineHeight: 1.70 }}>
          Building tools that give founders an unfair advantage — self-hosted,
          privacy-first, zero marginal cost. Drip is one of many experiments in eliminating
          manual work from early-stage B2B sales.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a
            href="https://buildwithkulshresth.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '9px 18px', borderRadius: '8px',
              background: 'var(--accent)', color: '#fff',
              textDecoration: 'none', fontSize: '13px', fontWeight: 600,
              boxShadow: '0 0 16px rgba(99,102,241,0.35)',
              transition: 'box-shadow 150ms, transform 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 28px rgba(99,102,241,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            🔗  Check out more tools
          </a>
        </div>
      </section>

      {/* ── More tools ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: '40px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.10em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '16px' }}>
          More by Kulshresth
        </p>
        <div style={{
          padding: '18px 20px', borderRadius: '12px',
          border: '1px solid var(--border)', backgroundColor: 'var(--card)',
        }}>
          <a
            href="https://buildwithkulshresth.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              textDecoration: 'none', gap: '12px',
            }}
          >
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 3px' }}>
                buildwithkulshresth.com
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0 }}>
                All tools, experiments, and projects in one place.
              </p>
            </div>
            <span style={{ fontSize: '16px', color: 'var(--accent)', flexShrink: 0 }}>→</span>
          </a>
        </div>
      </section>

      {/* ── Got a suggestion ─────────────────────────────────────────────── */}
      <section style={{ marginTop: '32px' }}>
        <div style={{
          padding: '22px 24px', borderRadius: '12px',
          border: '1px dashed var(--border-md)', backgroundColor: 'var(--hover)',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 6px' }}>
            Got a suggestion?
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.60 }}>
            Feature ideas, bugs, partnership, or just want to say hi — reach out through the site.
          </p>
          <a
            href="https://buildwithkulshresth.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '7px',
              border: '1px solid var(--border-md)', backgroundColor: 'var(--card)',
              color: 'var(--text-1)', textDecoration: 'none',
              fontSize: '12px', fontWeight: 500, transition: 'border-color 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
          >
            🌐  buildwithkulshresth.com
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: '56px', paddingTop: '20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-mono)' }}>
          Drip · v0.1.0 · 2026
        </p>
        <a
          href="https://buildwithkulshresth.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '11px', color: 'var(--accent)', textDecoration: 'none',
            transition: 'opacity 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          buildwithkulshresth.com →
        </a>
      </div>
    </div>
  );
}

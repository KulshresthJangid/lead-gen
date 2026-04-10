import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import logger from '../utils/logger.js';

const router = Router();

export const JWT_SECRET  = process.env.JWT_SECRET || 'leadgen-dev-secret-change-in-production';
const JWT_EXPIRES = '12h';

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeToken(user, tenantId, role) {
  return jwt.sign(
    { sub: user.id, tenantId, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

// POST /api/auth/register
const registerSchema = z.object({
  name:       z.string().min(1).max(100),
  email:      z.string().email(),
  password:   z.string().min(8),
  tenantName: z.string().min(1).max(60),
});

router.post('/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { name, email, password, tenantName } = parse.data;
  const db = getDb();

  try {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const tenantId   = randomUUID();
    const tenantSlug = slugify(tenantName);
    const userId     = randomUUID();
    const hash       = await bcrypt.hash(password, 12);

    await db.run(
      `INSERT INTO tenants (id, name, slug, plan, created_at) VALUES (?, ?, ?, 'free', CURRENT_TIMESTAMP)`,
      [tenantId, tenantName, tenantSlug],
    );
    await db.run(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
       VALUES (?, ?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`,
      [userId, tenantId, email, hash, name],
    );

    // Seed default tenant settings
    const DEFAULT_SETTINGS = {
      ollama_endpoint: 'http://localhost:11434',
      ollama_model: 'mistral',
      scraping_interval: '30',
      is_setup_complete: 'false',
      product_description: '',
      icp_description: '',
      scraper_targets: '[]',
    };
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await db.run(
        'INSERT OR IGNORE INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)',
        [tenantId, key, value],
      );
    }

    // Create a default campaign so the UI is never empty
    const campaignId = randomUUID();
    await db.run(
      `INSERT INTO campaigns (id, tenant_id, name, status, created_at, updated_at)
       VALUES (?, ?, 'Default Campaign', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [campaignId, tenantId],
    );

    const token = makeToken({ id: userId }, tenantId, 'owner');
    return res.status(201).json({
      token,
      user: { id: userId, name, email, role: 'owner', tenantId, tenantName },
    });
  } catch (err) {
    logger.error({ err }, 'register error');
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { email, password } = parse.data;
  const db = getDb();

  try {
    const user = await db.get(
      'SELECT u.*, t.name AS tenantName FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ?',
      [email],
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = makeToken(user, user.tenant_id, user.role);
    return res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, tenantId: user.tenant_id, tenantName: user.tenantName,
      },
    });
  } catch (err) {
    logger.error({ err }, 'login error');
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ valid: false });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: { id: decoded.sub, role: decoded.role, tenantId: decoded.tenantId } });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

// POST /api/auth/invite/accept
const acceptSchema = z.object({
  token:    z.string().uuid(),
  name:     z.string().min(1).max(100),
  password: z.string().min(8),
});

router.post('/invite/accept', async (req, res) => {
  const parse = acceptSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { token, name, password } = parse.data;
  const db = getDb();

  try {
    const inv = await db.get(
      `SELECT * FROM invitations WHERE id = ? AND accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
      [token],
    );
    if (!inv) return res.status(410).json({ error: 'Invitation expired or already used' });

    const existing = await db.get(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [inv.tenant_id, inv.email],
    );
    if (existing) return res.status(409).json({ error: 'Account already exists' });

    const hash   = await bcrypt.hash(password, 12);
    const userId = randomUUID();
    await db.run(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, invited_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, inv.tenant_id, inv.email, hash, name, inv.role, inv.invited_by],
    );
    await db.run('UPDATE invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [token]);

    const tenant = await db.get('SELECT name FROM tenants WHERE id = ?', [inv.tenant_id]);
    const jwtToken = makeToken({ id: userId }, inv.tenant_id, inv.role);
    return res.status(201).json({
      token: jwtToken,
      user: {
        id: userId, name, email: inv.email,
        role: inv.role, tenantId: inv.tenant_id, tenantName: tenant?.name,
      },
    });
  } catch (err) {
    logger.error({ err }, 'invite/accept error');
    return res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

export default router;

import crypto from 'crypto';
import levenshtein from 'fast-levenshtein';

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

export function hashEmail(email) {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

async function isDuplicate(db, lead, tenantId) {
  if (!lead.email || !lead.email.includes('@')) {
    return { isDupe: true, reason: 'missing_or_invalid_email' };
  }

  // Check 1: exact email hash match
  const byHash = await db.get(
    'SELECT id FROM leads WHERE email_hash = ? AND tenant_id = ?',
    [hashEmail(lead.email), tenantId],
  );
  if (byHash) return { isDupe: true, reason: 'email_hash_match' };

  // Check 2: fuzzy full_name within same company_domain
  if (lead.company_domain && lead.full_name) {
    const candidates = await db.all(
      'SELECT id, full_name FROM leads WHERE company_domain = ? AND tenant_id = ?',
      [lead.company_domain.toLowerCase().trim(), tenantId],
    );
    for (const c of candidates) {
      if (c.full_name && levenshtein.get(c.full_name, lead.full_name) < 3) {
        return { isDupe: true, reason: 'fuzzy_name_domain_match' };
      }
    }
  }

  return { isDupe: false };
}

/**
 * Filter an array of raw leads.
 * Returns { unique: RawLead[], dupes: { lead, reason }[] }
 */
export async function filter(db, leads, tenantId) {
  const unique = [];
  const dupes = [];

  for (const lead of leads) {
    const result = await isDuplicate(db, lead, tenantId);
    if (result.isDupe) {
      dupes.push({ lead, reason: result.reason });
    } else {
      lead.email_hash = hashEmail(lead.email);
      unique.push(lead);
    }
  }

  return { unique, dupes };
}

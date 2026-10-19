import crypto from 'crypto';
import levenshtein from 'fast-levenshtein';

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

export function hashEmail(email) {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function normalizePhoneForHash(phone) {
  return phone.replace(/\D/g, ''); // digits only — "+233 302 227 822" and "233302227822" hash the same
}

export function hashPhone(phone) {
  return crypto.createHash('sha256').update(normalizePhoneForHash(phone)).digest('hex');
}

function hasValidEmail(lead) {
  return !!(lead.email && lead.email.includes('@'));
}

function hasValidPhone(lead) {
  return !!(lead.phone && lead.phone.replace(/\D/g, '').length >= 7);
}

async function isDuplicate(db, lead, tenantId) {
  const withEmail = hasValidEmail(lead);
  const withPhone = hasValidPhone(lead);

  // No usable contact method at all — genuinely not a lead, not a dupe.
  if (!withEmail && !withPhone) {
    return { isDupe: true, reason: 'missing_contact_method' };
  }

  // Check 1: exact email hash match
  if (withEmail) {
    const byHash = await db.get(
      'SELECT id FROM leads WHERE email_hash = ? AND tenant_id = ?',
      [hashEmail(lead.email), tenantId],
    );
    if (byHash) return { isDupe: true, reason: 'email_hash_match' };
  }

  // Check 1b: exact phone hash match (for phone-only or phone+email leads)
  if (withPhone) {
    const byPhoneHash = await db.get(
      'SELECT id FROM leads WHERE phone_hash = ? AND tenant_id = ?',
      [hashPhone(lead.phone), tenantId],
    );
    if (byPhoneHash) return { isDupe: true, reason: 'phone_hash_match' };
  }

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
      if (hasValidEmail(lead)) lead.email_hash = hashEmail(lead.email);
      if (hasValidPhone(lead)) lead.phone_hash = hashPhone(lead.phone);
      unique.push(lead);
    }
  }

  return { unique, dupes };
}

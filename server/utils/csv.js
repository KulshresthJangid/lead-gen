import { stringify } from 'csv-stringify/sync';

const COLUMNS = [
  'id', 'full_name', 'job_title', 'company_name', 'company_domain',
  'email', 'linkedin_url', 'location', 'pain_points', 'reason_for_outreach',
  'lead_quality', 'confidence_score', 'manual_category', 'manual_notes',
  'source', 'created_at',
];

/**
 * Prefix cells starting with =, +, -, @ to prevent CSV injection.
 */
function sanitizeCell(value) {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function leadsToCSV(leads) {
  const sanitized = leads.map((lead) => {
    const row = {};
    for (const col of COLUMNS) {
      row[col] = sanitizeCell(lead[col] ?? '');
    }
    return row;
  });
  return stringify(sanitized, { header: true, columns: COLUMNS });
}

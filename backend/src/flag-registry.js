// Stores invoice flags (user disputes/corrections) in Supabase.
// Requires table: invoice_flags (id, payment_id, flagger_wallet, reason, created_at)
//
// Create with:
//   create table invoice_flags (
//     id bigserial primary key,
//     payment_id text not null,
//     flagger_wallet text not null,
//     reason text not null,
//     created_at timestamptz default now()
//   );

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function buildRestUrl(path) {
  const base = trimTrailingSlash(process.env.SUPABASE_URL || '');
  return `${base}/rest/v1/${path.replace(/^\//, '')}`;
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=representation';
  }

  const response = await fetch(buildRestUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.details || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

const FLAG_REASONS = [
  'Incorrect amount',
  'Not my invoice',
  'Already paid',
  'Duplicate invoice',
  'Other',
];

function createFlagRegistry() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return {
    async createFlag({ paymentId, flaggerWallet, reason }) {
      if (!FLAG_REASONS.includes(reason)) {
        throw new Error(`Invalid reason. Must be one of: ${FLAG_REASONS.join(', ')}`);
      }

      const rows = await supabaseRequest('invoice_flags', {
        method: 'POST',
        body: {
          payment_id: paymentId,
          flagger_wallet: flaggerWallet.trim().toLowerCase(),
          reason,
        },
      });

      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        id: row.id,
        paymentId: row.payment_id,
        flaggerWallet: row.flagger_wallet,
        reason: row.reason,
        createdAt: row.created_at,
      };
    },

    async getFlagsByPaymentId(paymentId) {
      const rows = await supabaseRequest(
        `invoice_flags?payment_id=eq.${encodeURIComponent(paymentId)}&order=created_at.desc`
      );
      return Array.isArray(rows) ? rows.map(r => ({
        id: r.id,
        paymentId: r.payment_id,
        flaggerWallet: r.flagger_wallet,
        reason: r.reason,
        createdAt: r.created_at,
      })) : [];
    },

    // Returns all flags submitted by a specific wallet (for pre-populating UI state on reload)
    async getFlagsByFlaggerWallet(flaggerWallet) {
      const rows = await supabaseRequest(
        `invoice_flags?flagger_wallet=eq.${encodeURIComponent(flaggerWallet.trim().toLowerCase())}&order=created_at.desc`
      );
      return Array.isArray(rows) ? rows.map(r => ({
        id: r.id,
        paymentId: r.payment_id,
        flaggerWallet: r.flagger_wallet,
        reason: r.reason,
        createdAt: r.created_at,
      })) : [];
    },

    // Returns all flags for a list of paymentIds in one query
    async getFlagsForPaymentIds(paymentIds) {
      if (!paymentIds || paymentIds.length === 0) return [];
      const inClause = paymentIds.map(id => encodeURIComponent(id)).join(',');
      const rows = await supabaseRequest(
        `invoice_flags?payment_id=in.(${inClause})&order=created_at.desc`
      );
      return Array.isArray(rows) ? rows.map(r => ({
        id: r.id,
        paymentId: r.payment_id,
        flaggerWallet: r.flagger_wallet,
        reason: r.reason,
        createdAt: r.created_at,
      })) : [];
    },
  };
}

module.exports = { createFlagRegistry, FLAG_REASONS };

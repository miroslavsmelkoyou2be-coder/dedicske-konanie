import { createClient } from '@supabase/supabase-js';

function json(res, status, body) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(body));
}

function getAdminClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function isActiveAdminByEmail(supabase, email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const { data, error } = await supabase
        .from('app_users')
        .select('email')
        .eq('role', 'admin')
        .eq('is_active', true)
        .eq('email', normalized)
        .maybeSingle();
    return !error && !!data;
}

export default async function handler(req, res) {
    try {
        const supabase = getAdminClient();

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('app_users')
                .select('email, role, participant_id, is_active')
                .order('role', { ascending: false });
            if (error) return json(res, 500, { error: 'Nepodarilo sa nacitat email pristupy.' });
            return json(res, 200, { items: data || [] });
        }

        if (req.method === 'PUT') {
            const actorEmail = normalizeEmail(req.headers['x-actor-email'] || '');
            const actorRole = String(req.headers['x-actor-role'] || '').toLowerCase();
            if (actorRole !== 'admin') return json(res, 403, { error: 'Iba admin moze upravovat pristupy.' });
            const adminOk = await isActiveAdminByEmail(supabase, actorEmail);
            if (!adminOk) return json(res, 403, { error: 'Neplatny admin kontext.' });

            const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
            if (!rows || rows.length === 0) return json(res, 400, { error: 'Chybaju data na ulozenie.' });

            // Full replace strategy
            const { error: delError } = await supabase.from('app_users').delete().neq('email', '');
            if (delError) return json(res, 500, { error: 'Nepodarilo sa pripravit ulozenie.' });
            const { error: insError } = await supabase.from('app_users').insert(rows);
            if (insError) return json(res, 500, { error: 'Ulozenie pristupov zlyhalo.' });
            return json(res, 200, { ok: true });
        }

        return json(res, 405, { error: 'Method not allowed' });
    } catch (e) {
        return json(res, 500, { error: 'Server error pri sprave email pristupov.' });
    }
}

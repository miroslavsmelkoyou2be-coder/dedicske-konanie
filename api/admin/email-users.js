import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

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

function hashIp(ip) {
    return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

async function checkRateLimit(supabase, ipHash) {
    const sinceIso = new Date(Date.now() - 60 * 1000).toISOString();
    const { count, error } = await supabase
        .from('admin_access_audit')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'save_email_users')
        .eq('actor_ip_hash', ipHash)
        .gte('created_at', sinceIso);
    if (error) return { ok: true };
    // Max 10 save attempts per minute per IP
    return { ok: (count || 0) < 10 };
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

async function requireActiveAdmin(req, res, supabase) {
    const actorEmail = normalizeEmail(req.headers['x-actor-email'] || '');
    const actorRole = String(req.headers['x-actor-role'] || '').toLowerCase();
    if (actorRole !== 'admin') {
        json(res, 403, { error: 'Iba admin moze spravovat pristupy.' });
        return null;
    }
    const adminOk = await isActiveAdminByEmail(supabase, actorEmail);
    if (!adminOk) {
        json(res, 403, { error: 'Neplatny admin kontext.' });
        return null;
    }
    return { actorEmail, actorRole };
}

export default async function handler(req, res) {
    try {
        const supabase = getAdminClient();

        if (req.method === 'GET') {
            if (req.query?.audit === '1') {
                const actor = await requireActiveAdmin(req, res, supabase);
                if (!actor) return;
                const { data, error } = await supabase
                    .from('admin_access_audit')
                    .select('actor_email, actor_role, action, payload, created_at')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) return json(res, 500, { error: 'Nepodarilo sa nacitat audit pristupov.' });
                return json(res, 200, { items: data || [] });
            }
            const { data, error } = await supabase
                .from('app_users')
                .select('email, role, participant_id, is_active')
                .order('role', { ascending: false });
            if (error) return json(res, 500, { error: 'Nepodarilo sa nacitat email pristupy.' });
            return json(res, 200, { items: data || [] });
        }

        if (req.method === 'PUT') {
            const actor = await requireActiveAdmin(req, res, supabase);
            if (!actor) return;
            const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
            const ipHash = hashIp(ip);
            const rate = await checkRateLimit(supabase, ipHash);
            if (!rate.ok) return json(res, 429, { error: 'Prilis vela pokusov. Skuste to o chvilu.' });

            const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
            if (!rows || rows.length === 0) return json(res, 400, { error: 'Chybaju data na ulozenie.' });

            // Full replace strategy
            const { error: delError } = await supabase.from('app_users').delete().neq('email', '');
            if (delError) return json(res, 500, { error: 'Nepodarilo sa pripravit ulozenie.' });
            const { error: insError } = await supabase.from('app_users').insert(rows);
            if (insError) return json(res, 500, { error: 'Ulozenie pristupov zlyhalo.' });
            await supabase.from('admin_access_audit').insert({
                actor_email: actor.actorEmail,
                actor_role: actor.actorRole,
                actor_ip_hash: ipHash,
                action: 'save_email_users',
                payload: { count: rows.length },
            });
            return json(res, 200, { ok: true });
        }

        return json(res, 405, { error: 'Method not allowed' });
    } catch (e) {
        return json(res, 500, { error: 'Server error pri sprave email pristupov.' });
    }
}

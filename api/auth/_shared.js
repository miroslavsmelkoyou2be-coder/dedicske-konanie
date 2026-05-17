import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export function getAdminClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export function json(res, status, body) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(body));
}

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function randomSixDigitCode() {
    const n = crypto.randomInt(0, 1000000);
    return String(n).padStart(6, '0');
}

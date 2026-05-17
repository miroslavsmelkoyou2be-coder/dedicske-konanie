import { getAdminClient, json, normalizeEmail, hashCode, randomSixDigitCode } from './_shared.js';

async function sendEmailWithResend(toEmail, code) {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
        throw new Error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL');
    }

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [toEmail],
            subject: 'Overovaci kod pre prihlasenie',
            text: `Vas overovaci kod je: ${code}\nKod plati 10 minut.`,
        }),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Resend failed: ${resp.status} ${text}`);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    try {
        const { email } = req.body || {};
        const normalized = normalizeEmail(email);
        if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
            return json(res, 400, { error: 'Zadajte platny email.' });
        }

        const supabase = getAdminClient();
        const { data: user, error: userErr } = await supabase
            .from('app_users')
            .select('email, role, participant_id, is_active')
            .eq('email', normalized)
            .single();

        if (userErr || !user || user.is_active === false) {
            return json(res, 403, { error: 'Email nie je povoleny pre pristup do aplikacie.' });
        }

        const code = randomSixDigitCode();
        const codeHash = hashCode(code);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        // Best-effort cleanup of older pending codes for this email.
        await supabase
            .from('email_otps')
            .delete()
            .eq('email', normalized)
            .is('used_at', null);

        const { error: insErr } = await supabase
            .from('email_otps')
            .insert({ email: normalized, code_hash: codeHash, expires_at: expiresAt });
        if (insErr) {
            return json(res, 500, { error: 'Nepodarilo sa ulozit OTP kod.' });
        }

        await sendEmailWithResend(normalized, code);
        return json(res, 200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e || 'unknown_error');
        return json(res, 500, { error: 'Nepodarilo sa odoslat overovaci kod.', detail: msg });
    }
}

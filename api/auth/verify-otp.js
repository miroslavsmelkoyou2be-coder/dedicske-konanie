import { getAdminClient, json, normalizeEmail, hashCode } from './_shared.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    try {
        const { email, code } = req.body || {};
        const normalized = normalizeEmail(email);
        const otp = String(code || '').trim();
        if (!normalized || !otp) {
            return json(res, 400, { error: 'Zadajte email a overovaci kod.' });
        }
        if (!/^\d{6}$/.test(otp)) {
            return json(res, 400, { error: 'Overovaci kod musi mat 6 cislic.' });
        }

        const supabase = getAdminClient();
        const nowIso = new Date().toISOString();
        const codeHash = hashCode(otp);

        const { data: otpRow, error: otpErr } = await supabase
            .from('email_otps')
            .select('id, email, code_hash, expires_at, used_at, created_at')
            .eq('email', normalized)
            .is('used_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (otpErr || !otpRow) {
            return json(res, 401, { error: 'Kod nie je platny.' });
        }
        if (otpRow.expires_at <= nowIso) {
            return json(res, 401, { error: 'Kod expiroval. Poslite novy.' });
        }
        if (otpRow.code_hash !== codeHash) {
            return json(res, 401, { error: 'Nespravny overovaci kod.' });
        }

        const { data: user, error: userErr } = await supabase
            .from('app_users')
            .select('email, role, participant_id, is_active')
            .eq('email', normalized)
            .single();

        if (userErr || !user || user.is_active === false) {
            return json(res, 403, { error: 'Email nie je aktivny pre prihlasenie.' });
        }

        await supabase.from('email_otps').update({ used_at: nowIso }).eq('id', otpRow.id);

        return json(res, 200, {
            ok: true,
            role: user.role,
            participantId: user.participant_id,
            email: user.email,
        });
    } catch (e) {
        return json(res, 500, { error: 'Overenie kodu zlyhalo.' });
    }
}

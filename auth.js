/**
 * Dediccke konanie - Auth Module (email OTP only)
 */

import { supabase } from './supabase.js';
import { showToast, renderAuthUI } from './ui.js';

export const AUTH_STORAGE_KEY = 'dedicskeKonanieAuth';
const isSupabaseDisabled = () => !!globalThis.__DISABLE_SUPABASE__;

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
let inactivityTimer = null;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];

const _auth = {
    currentUser: null, // null | { role: 'admin' } | { role: 'heir', index: 0-3 }
    emailAuthAvailable: false,
};

function sessionExpired() {
    if (getAuth().currentUser) {
        showToast('Session vyprsala - budete odhlaseny pre necinnost.', 'warning');
        logout();
    }
}

export function startInactivityTimer() {
    stopInactivityTimer();
    inactivityTimer = setTimeout(sessionExpired, SESSION_TIMEOUT_MS);
}

export function resetInactivityTimer() {
    if (inactivityTimer !== null) startInactivityTimer();
}

export function stopInactivityTimer() {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

export function bindActivityListeners() {
    ACTIVITY_EVENTS.forEach((event) => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
}

export function getAuth() {
    return _auth;
}

export function hasEmailAuthConfigured() {
    return _auth.emailAuthAvailable === true;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function loadEmailProfile(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const { data, error } = await supabase
        .from('app_users')
        .select('email, role, participant_id, is_active')
        .eq('email', normalized)
        .single();
    if (error || !data || data.is_active === false) return null;
    return data;
}

function applyEmailProfile(profile) {
    if (!profile || !profile.role) return false;
    if (profile.role === 'admin') {
        _auth.currentUser = { role: 'admin', authType: 'email', email: normalizeEmail(profile.email) };
        return true;
    }
    if (profile.role === 'heir' && Number.isInteger(profile.participant_id) && profile.participant_id >= 0 && profile.participant_id <= 3) {
        _auth.currentUser = {
            role: 'heir',
            index: profile.participant_id,
            authType: 'email',
            email: normalizeEmail(profile.email),
        };
        return true;
    }
    return false;
}

export async function restoreEmailSession() {
    if (isSupabaseDisabled()) return false;
    try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;
        if (!email) return false;
        const profile = await loadEmailProfile(email);
        if (!profile) return false;
        return applyEmailProfile(profile);
    } catch (e) {
        console.warn('Email session restore failed:', e);
        return false;
    }
}

export async function requestEmailMagicLink(email) {
    if (isSupabaseDisabled()) return { ok: false, error: 'Email auth disabled in tests' };
    const normalized = normalizeEmail(email);
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: 'Zadajte platny email' };
    }
    try {
        const response = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalized }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: payload.error || 'Nepodarilo sa odoslat prihlasovaci email.' };
        }
    } catch (e) {
        return { ok: false, error: 'Nepodarilo sa kontaktovat prihlasovaci server.' };
    }
    return { ok: true };
}

export async function verifyEmailOtp(email, code) {
    if (isSupabaseDisabled()) return { ok: false, error: 'Email auth disabled in tests' };
    const normalized = normalizeEmail(email);
    const otp = String(code || '').trim();
    if (!normalized || !otp) {
        return { ok: false, error: 'Zadajte email a overovaci kod.' };
    }
    try {
        const response = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalized, code: otp }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: payload.error || 'Overenie kodu zlyhalo.' };
        }

        if (payload.role === 'admin') {
            _auth.currentUser = { role: 'admin', authType: 'email_otp', email: normalized };
        } else if (payload.role === 'heir' && Number.isInteger(payload.participantId)) {
            _auth.currentUser = { role: 'heir', index: payload.participantId, authType: 'email_otp', email: normalized };
        } else {
            return { ok: false, error: 'Neplatny profil pouzivatela.' };
        }
        await saveAuth({ persistSession: true });
        startInactivityTimer();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: 'Nepodarilo sa kontaktovat overovaci server.' };
    }
}

export async function saveAuth(options = {}) {
    const { persistSession = true } = options;
    try {
        const sessionData = {};
        if (persistSession && _auth.currentUser) {
            sessionData.currentUser = _auth.currentUser;
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
        console.warn('localStorage auth save failed:', e);
    }
}

export async function loadAuth() {
    _auth.emailAuthAvailable = false;
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data.currentUser) _auth.currentUser = data.currentUser;
        }
    } catch (e) {
        // ignore
    }

    if (!isSupabaseDisabled()) {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('email')
                .eq('role', 'admin')
                .eq('is_active', true)
                .limit(1);
            if (!error && Array.isArray(data) && data.length > 0) {
                _auth.emailAuthAvailable = true;
            }
        } catch (e) {
            // ignore
        }
    }

    return !!_auth.currentUser || _auth.emailAuthAvailable;
}

export async function clearAuth() {
    stopInactivityTimer();
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {
        // ignore
    }
    _auth.currentUser = null;
}

export async function logout() {
    stopInactivityTimer();
    if (_auth.currentUser?.authType === 'email' && !isSupabaseDisabled()) {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn('Supabase signOut failed:', e);
        }
    }
    _auth.currentUser = null;
    await saveAuth();
    renderAuthUI();
}

export function isAdmin() {
    return _auth.currentUser && _auth.currentUser.role === 'admin';
}

export function isHeir(index) {
    return _auth.currentUser && _auth.currentUser.role === 'heir' && _auth.currentUser.index === index;
}

export function canEditItems() {
    return isAdmin();
}

export function canEditAllocations(participantId) {
    return isAdmin() || isHeir(participantId);
}

export function canEditParticipant(participantId) {
    return isAdmin() || isHeir(participantId);
}

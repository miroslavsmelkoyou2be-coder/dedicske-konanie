/**
 * Dedičské konanie – Auth Module (ES Module)
 *
 * PIN hashing, session management, login/logout, permission helpers.
 * PIN hashes are stored in Supabase (shared across browsers).
 */

import { supabase } from './supabase.js';
import { showToast, renderAuthUI } from './ui.js';

// ==============================
// Auth Constants
// ==============================
export const AUTH_STORAGE_KEY = 'dedicskeKonanieAuth';
export const AUTH_VERSION = 2;
const isSupabaseDisabled = () => !!globalThis.__DISABLE_SUPABASE__;

// Crypto helper: hash PIN using SHA-256
export async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Session timeout: auto-logout after 15 minutes of inactivity
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let inactivityTimer = null;
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];

function sessionExpired() {
    if (getAuth().currentUser) {
        showToast('Session vypršala – budete odhlásený pre nečinnosť.', 'warning');
        logout();
    }
}

export function startInactivityTimer() {
    stopInactivityTimer();
    inactivityTimer = setTimeout(sessionExpired, SESSION_TIMEOUT_MS);
}

export function resetInactivityTimer() {
    if (inactivityTimer !== null) {
        startInactivityTimer();
    }
}

export function stopInactivityTimer() {
    if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

export function bindActivityListeners() {
    ACTIVITY_EVENTS.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
}

const _auth = {
    adminPin: '',
    heirPins: ['', '', '', ''],
    currentUser: null,  // null | { role: 'admin' } | { role: 'heir', index: 0-3 }
    authVersion: AUTH_VERSION,
};

export function getAuth() {
    return _auth;
}

export async function saveAuth(options = {}) {
    const { persistSession = true } = options;
    const payload = {
        admin_pin: _auth.adminPin,
        heir_pins: _auth.heirPins,
        auth_version: _auth.authVersion || AUTH_VERSION,
    };

    // Save to Supabase (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
            const { error } = await supabase
                .from('pins')
                .upsert(
                    { id: 1, ...payload, updated_at: new Date().toISOString() },
                    { onConflict: 'id' }
                );
            if (error) {
                console.warn('Supabase pins save error:', error);
            }
        } catch (e) {
            console.warn('Supabase pins save failed, using localStorage fallback:', e);
        }
    }

    // Also save session to localStorage (browser-specific session)
    try {
        const sessionData = {
            adminPin: _auth.adminPin,
            heirPins: _auth.heirPins,
            authVersion: _auth.authVersion || AUTH_VERSION,
        };
        if (persistSession && _auth.currentUser) {
            sessionData.currentUser = _auth.currentUser;
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (e) {
        console.warn('localStorage auth save failed:', e);
    }
}

export async function loadAuth() {
    let supabaseHadData = false;

    // Try Supabase first (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
            const { data, error } = await supabase
                .from('pins')
                .select('admin_pin, heir_pins, auth_version')
                .eq('id', 1)
                .single();

            if (!error && data) {
                supabaseHadData = true;
                if (data.admin_pin) _auth.adminPin = data.admin_pin;
                if (Array.isArray(data.heir_pins) && data.heir_pins.length === 4) {
                    _auth.heirPins = data.heir_pins;
                }
                if (typeof data.auth_version === 'number') {
                    _auth.authVersion = data.auth_version;
                }
                console.log('PIN-y načítané zo Supabase');
            }
        } catch (e) {
            console.warn('Supabase auth load failed, trying localStorage:', e);
        }
    }

    // Fallback to localStorage (only if Supabase didn't have data)
    // Always restore currentUser from localStorage (browser-specific session)
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (!supabaseHadData) {
                if (data.adminPin) _auth.adminPin = data.adminPin;
                if (Array.isArray(data.heirPins) && data.heirPins.length === 4) {
                    _auth.heirPins = data.heirPins;
                }
                if (data.authVersion) _auth.authVersion = data.authVersion;
            }
            // Restore currentUser (remember me) - this is always browser-specific
            if (data.currentUser) {
                _auth.currentUser = data.currentUser;
            }
            return true;
        }
    } catch (e) {
        // ignore
    }

    return supabaseHadData || !!_auth.adminPin;
}

export async function clearAuth() {
    stopInactivityTimer();

    // Clear Supabase pins (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
            await supabase
                .from('pins')
                .upsert(
                    {
                        id: 1,
                        admin_pin: '',
                        heir_pins: ['', '', '', ''],
                        auth_version: AUTH_VERSION,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'id' }
                );
        } catch (e) {
            console.warn('Supabase pins clear failed:', e);
        }
    }

    // Clear localStorage
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {
        // ignore
    }

    _auth.adminPin = '';
    _auth.heirPins = ['', '', '', ''];
    _auth.currentUser = null;
    _auth.authVersion = AUTH_VERSION;
}

export async function login(pin, rememberMe = true) {
    // Hash the input PIN for comparison
    const hashedPin = await hashPin(pin);

    // Ensure latest PINs are loaded from Supabase
    await loadAuth();

    if (hashedPin === _auth.adminPin) {
        _auth.currentUser = { role: 'admin' };
        await saveAuth({ persistSession: rememberMe });
        startInactivityTimer();
        return true;
    }
    for (let i = 0; i < _auth.heirPins.length; i++) {
        if (_auth.heirPins[i] === hashedPin) {
            _auth.currentUser = { role: 'heir', index: i };
            await saveAuth({ persistSession: rememberMe });
            startInactivityTimer();
            return true;
        }
    }
    return false;
}

export async function logout() {
    stopInactivityTimer();
    _auth.currentUser = null;
    await saveAuth();
    renderAuthUI();
}

// Permission helpers
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

// ==============================
// Migration: Hash existing plain-text PINs
// ==============================
export async function migrateAuthToHashed() {
    if (_auth.authVersion >= AUTH_VERSION) return false;

    let changed = false;
    if (_auth.adminPin && _auth.adminPin.length < 64) {
        _auth.adminPin = await hashPin(_auth.adminPin);
        changed = true;
    }
    for (let i = 0; i < _auth.heirPins.length; i++) {
        if (_auth.heirPins[i] && _auth.heirPins[i].length < 64) {
            _auth.heirPins[i] = await hashPin(_auth.heirPins[i]);
            changed = true;
        }
    }
    if (changed) {
        _auth.authVersion = AUTH_VERSION;
        await saveAuth();
    }
    return changed;
}

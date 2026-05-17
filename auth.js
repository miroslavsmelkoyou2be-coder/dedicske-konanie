/**
 * Dedičské konanie – Auth Module (ES Module)
 *
 * PIN hashing, session management, login/logout, permission helpers.
 */

import { showToast, renderAuthUI } from './ui.js';

// ==============================
// Auth Constants
// ==============================
export const AUTH_STORAGE_KEY = 'dedicskeKonanieAuth';
export const AUTH_VERSION = 2;

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

export function saveAuth(options = {}) {
    const { persistSession = true } = options;
    try {
        const data = {
            adminPin: _auth.adminPin,
            heirPins: _auth.heirPins,
            authVersion: _auth.authVersion || AUTH_VERSION,
        };
        if (persistSession && _auth.currentUser) {
            data.currentUser = _auth.currentUser;
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Nepodarilo sa uložiť auth:', e);
    }
}

export function loadAuth() {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.adminPin) _auth.adminPin = data.adminPin;
        if (Array.isArray(data.heirPins) && data.heirPins.length === 4) {
            _auth.heirPins = data.heirPins;
        }
        // Restore currentUser (remember me)
        if (data.currentUser) {
            _auth.currentUser = data.currentUser;
        }
        return true;
    } catch (e) {
        return false;
    }
}

export function clearAuth() {
    stopInactivityTimer();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    _auth.adminPin = '';
    _auth.heirPins = ['', '', '', ''];
    _auth.currentUser = null;
    _auth.authVersion = AUTH_VERSION;
}

export async function login(pin, rememberMe = true) {
    // Hash the input PIN for comparison
    const hashedPin = await hashPin(pin);

    if (hashedPin === _auth.adminPin) {
        _auth.currentUser = { role: 'admin' };
        saveAuth({ persistSession: rememberMe });
        startInactivityTimer();
        return true;
    }
    for (let i = 0; i < _auth.heirPins.length; i++) {
        if (_auth.heirPins[i] === hashedPin) {
            _auth.currentUser = { role: 'heir', index: i };
            saveAuth({ persistSession: rememberMe });
            startInactivityTimer();
            return true;
        }
    }
    return false;
}

export function logout() {
    stopInactivityTimer();
    _auth.currentUser = null;
    saveAuth();
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
        saveAuth();
    }
    return changed;
}

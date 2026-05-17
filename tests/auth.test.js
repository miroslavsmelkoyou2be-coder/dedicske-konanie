/**
 * Auth Module Tests
 *
 * Tests: hashPin, saveAuth/loadAuth session persistence, clearAuth,
 *        permission helpers in email-only auth mode
 */

import { assert, assertEqual, printSummary } from './helpers.js';

export async function testAuth({ window, document }) {
    // Dynamic import of production modules (globals already set up by helpers)
    const authMod = await import('../auth.js');
    const {
        hashPin, saveAuth, loadAuth, clearAuth,
        login, logout, isAdmin, isHeir,
        canEditItems, canEditAllocations, canEditParticipant,
        migrateAuthToHashed, getAuth, AUTH_STORAGE_KEY, AUTH_VERSION,
    } = authMod;

    // Also import ui.js (needed for showToast, renderAuthUI used by auth.js)
    // But we don't need its exports directly for auth tests

    console.log('\n\u{1F4C1} Auth Module');

    // ─── hashPin ──────────────────────────────────────────
    console.log('  \u2500\u2500 hashPin');

    const hash1 = await hashPin('0000');
    assertEqual(hash1.length, 64, 'SHA-256 hash of "0000" is 64 hex chars');
    assertEqual(hash1, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0',
        'SHA-256 of "0000" matches known value');

    const hash2 = await hashPin('1234');
    assert(hash2 !== hash1, 'Different PINs produce different hashes');

    const hash3 = await hashPin('0000');
    assertEqual(hash1, hash3, 'Same PIN produces same hash (deterministic)');

    // ─── saveAuth / loadAuth / clearAuth ─────────────────
    console.log('  \u2500\u2500 Auth Persistence');

    const a1 = getAuth();
    a1.currentUser = { role: 'admin' };
    await saveAuth({ persistSession: true });

    a1.currentUser = null;

    const found = await loadAuth();
    assert(found, 'loadAuth returns true when data exists');
    assertEqual(a1.currentUser.role, 'admin', 'Current user restored (remember-me)');

    // ─── loadAuth without data / clearAuth ────────────────
    console.log('  \u2500\u2500 loadAuth - no data / clearAuth');

    await clearAuth();
    const notFound = await loadAuth();
    assert(!notFound, 'loadAuth returns false when no data');
    assertEqual(a1.currentUser, null, 'currentUser null after clearAuth');
    assert(!window.localStorage.getItem(AUTH_STORAGE_KEY), 'clearAuth removes localStorage item');

    // ─── login / logout (PIN disabled) ────────────────────
    console.log('  \u2500\u2500 login / logout (PIN disabled)');
    const badLogin = await login('1234');
    assert(!badLogin, 'login via PIN is disabled and returns false');
    await logout();

    // ─── Permission helpers ────────────────────────────────
    console.log('  \u2500\u2500 Permission helpers');

    const a3 = getAuth();
    a3.currentUser = null;

    assert(!canEditItems(), 'canEditItems false when not logged in');
    assert(!canEditAllocations(0), 'canEditAllocations false when not logged in');
    assert(!canEditParticipant(0), 'canEditParticipant false when not logged in');

    a3.currentUser = { role: 'admin' };
    assert(canEditItems(), 'canEditItems true for admin');
    assert(canEditAllocations(0), 'canEditAllocations true for admin');
    assert(canEditAllocations(1), 'canEditAllocations true for any participant');
    assert(canEditParticipant(0), 'canEditParticipant true for admin');
    a3.currentUser = null;

    a3.currentUser = { role: 'heir', index: 1 };
    assert(!canEditItems(), 'canEditItems false for heir');
    assert(canEditAllocations(1), 'canEditAllocations(1) true for heir 1 (own)');
    assert(!canEditAllocations(0), 'canEditAllocations(0) false for heir 1 (other)');
    assert(canEditParticipant(1), 'canEditParticipant(1) true for heir 1 (self)');
    assert(!canEditParticipant(0), 'canEditParticipant(0) false for heir 1 (other)');
    a3.currentUser = null;

    // ─── migrateAuthToHashed ──────────────────────────────
    console.log('  \u2500\u2500 migrateAuthToHashed');

    const changed = await migrateAuthToHashed();
    assert(!changed, 'migrateAuthToHashed is disabled in email-only mode');

    return printSummary('Auth Module');
}

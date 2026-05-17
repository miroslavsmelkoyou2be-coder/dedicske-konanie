/**
 * Auth Module Tests
 *
 * Tests: hashPin, saveAuth, loadAuth, clearAuth, login, logout,
 *        isAdmin, isHeir, canEditItems, canEditAllocations,
 *        canEditParticipant, migrateAuthToHashed
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
    a1.adminPin = 'hashed_admin_pin_123';
    a1.heirPins = ['hashed_heir_0', '', 'hashed_heir_2', ''];
    a1.currentUser = { role: 'admin' };
    await saveAuth({ persistSession: true });

    a1.adminPin = '';
    a1.heirPins = ['', '', '', ''];
    a1.currentUser = null;

    const found = await loadAuth();
    assert(found, 'loadAuth returns true when data exists');
    assertEqual(a1.adminPin, 'hashed_admin_pin_123', 'Admin PIN restored from storage');
    assertEqual(a1.heirPins[0], 'hashed_heir_0', 'Heir 0 PIN restored');
    assertEqual(a1.heirPins[1], '', 'Empty heir PIN remains empty');
    assertEqual(a1.currentUser.role, 'admin', 'Current user restored (remember-me)');

    // ─── loadAuth without data / clearAuth ────────────────
    console.log('  \u2500\u2500 loadAuth - no data / clearAuth');

    await clearAuth();
    const notFound = await loadAuth();
    assert(!notFound, 'loadAuth returns false when no data');
    assertEqual(a1.adminPin, '', 'adminPin empty after clearAuth');
    assertEqual(a1.currentUser, null, 'currentUser null after clearAuth');
    assert(!window.localStorage.getItem(AUTH_STORAGE_KEY), 'clearAuth removes localStorage item');

    // ─── login / logout ───────────────────────────────────
    console.log('  \u2500\u2500 login / logout');

    const a2 = getAuth();
    a2.adminPin = await hashPin('1234');
    a2.heirPins = ['', await hashPin('5678'), '', ''];
    a2.currentUser = null;

    const badLogin = await login('wrong');
    assert(!badLogin, 'login with wrong PIN returns false');
    assertEqual(a2.currentUser, null, 'currentUser null on failed login');

    const adminLogin = await login('1234');
    assert(adminLogin, 'login with correct admin PIN returns true');
    assert(isAdmin(), 'isAdmin() true after admin login');

    await logout();
    assert(!isAdmin(), 'isAdmin() false after logout');
    assertEqual(a2.currentUser, null, 'currentUser null after logout');

    const heirLogin = await login('5678');
    assert(heirLogin, 'login with correct heir PIN returns true');
    assert(!isAdmin(), 'isAdmin() false for heir');
    assert(isHeir(1), 'isHeir(1) true for heir 1');
    assert(!isHeir(0), 'isHeir(0) false for heir 1');

    await logout();

    // ─── Permission helpers ────────────────────────────────
    console.log('  \u2500\u2500 Permission helpers');

    const a3 = getAuth();
    a3.adminPin = await hashPin('admin');
    a3.heirPins = ['', await hashPin('heir1'), '', ''];
    a3.currentUser = null;

    // Save to localStorage so login() -> loadAuth() can find them
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        adminPin: a3.adminPin,
        heirPins: a3.heirPins,
        authVersion: AUTH_VERSION,
    }));

    assert(!canEditItems(), 'canEditItems false when not logged in');
    assert(!canEditAllocations(0), 'canEditAllocations false when not logged in');
    assert(!canEditParticipant(0), 'canEditParticipant false when not logged in');

    await login('admin');
    assert(canEditItems(), 'canEditItems true for admin');
    assert(canEditAllocations(0), 'canEditAllocations true for admin');
    assert(canEditAllocations(1), 'canEditAllocations true for any participant');
    assert(canEditParticipant(0), 'canEditParticipant true for admin');
    await logout();

    await login('heir1');
    assert(!canEditItems(), 'canEditItems false for heir');
    assert(canEditAllocations(1), 'canEditAllocations(1) true for heir 1 (own)');
    assert(!canEditAllocations(0), 'canEditAllocations(0) false for heir 1 (other)');
    assert(canEditParticipant(1), 'canEditParticipant(1) true for heir 1 (self)');
    assert(!canEditParticipant(0), 'canEditParticipant(0) false for heir 1 (other)');
    await logout();

    // ─── migrateAuthToHashed ──────────────────────────────
    console.log('  \u2500\u2500 migrateAuthToHashed');

    const a4 = getAuth();
    await clearAuth();
    a4.adminPin = '1234'; // plain text (len 4 < 64)
    a4.heirPins = ['5678', '0000', '', '9999'];
    a4.authVersion = 1; // old version

    const changed = await migrateAuthToHashed();
    assert(changed, 'migrateAuthToHashed returns true when migration happened');
    assertEqual(a4.adminPin.length, 64, 'Admin PIN now hashed (64 chars)');
    assertEqual(a4.heirPins[0].length, 64, 'Heir 0 PIN now hashed');

    const expectedAdmin = await hashPin('1234');
    assertEqual(a4.adminPin, expectedAdmin, 'Hashed admin PIN matches hashPin("1234")');

    const changedAgain = await migrateAuthToHashed();
    assert(!changedAgain, 'Second migration returns false (no changes)');

    await clearAuth();
    a4.adminPin = 'hashed_already_64_chars_long_xxxxxxxxxxxxxxxx'; // fake 64-char hash
    a4.authVersion = AUTH_VERSION;
    const noChange = await migrateAuthToHashed();
    assert(!noChange, 'No migration when authVersion is current');

    return printSummary('Auth Module');
}

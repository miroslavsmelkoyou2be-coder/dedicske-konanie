/**
 * Auth Module Tests (email-only auth)
 */

import { assert, assertEqual, printSummary } from './helpers.js';

export async function testAuth({ window }) {
    const authMod = await import('../auth.js');
    const {
        saveAuth, loadAuth, clearAuth, logout,
        isAdmin, isHeir, canEditItems, canEditAllocations, canEditParticipant,
        getAuth, AUTH_STORAGE_KEY,
    } = authMod;

    console.log('\n\u{1F4C1} Auth Module');
    console.log('  -- Auth Persistence');

    const a1 = getAuth();
    a1.currentUser = { role: 'admin' };
    await saveAuth({ persistSession: true });
    a1.currentUser = null;

    const found = await loadAuth();
    assert(found, 'loadAuth returns true when data exists');
    assertEqual(a1.currentUser.role, 'admin', 'Current user restored (remember-me)');

    console.log('  -- loadAuth - no data / clearAuth');

    await clearAuth();
    const notFound = await loadAuth();
    assert(!notFound, 'loadAuth returns false when no data');
    assertEqual(a1.currentUser, null, 'currentUser null after clearAuth');
    assert(!window.localStorage.getItem(AUTH_STORAGE_KEY), 'clearAuth removes localStorage item');

    console.log('  -- logout');
    await logout();

    console.log('  -- Permission helpers');
    const a3 = getAuth();
    a3.currentUser = null;

    assert(!canEditItems(), 'canEditItems false when not logged in');
    assert(!canEditAllocations(0), 'canEditAllocations false when not logged in');
    assert(!canEditParticipant(0), 'canEditParticipant false when not logged in');

    a3.currentUser = { role: 'admin' };
    assert(canEditItems(), 'canEditItems true for admin');
    assert(canEditAllocations(0), 'canEditAllocations true for admin');
    assert(canEditParticipant(0), 'canEditParticipant true for admin');
    assert(isAdmin(), 'isAdmin true for admin');
    a3.currentUser = null;

    a3.currentUser = { role: 'heir', index: 1 };
    assert(!canEditItems(), 'canEditItems false for heir');
    assert(canEditAllocations(1), 'canEditAllocations true for own heir');
    assert(!canEditAllocations(0), 'canEditAllocations false for other heir');
    assert(canEditParticipant(1), 'canEditParticipant true for own heir');
    assert(!canEditParticipant(0), 'canEditParticipant false for other heir');
    assert(isHeir(1), 'isHeir(1) true for heir index 1');
    a3.currentUser = null;

    return printSummary('Auth Module');
}

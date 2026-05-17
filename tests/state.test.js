/**
 * State Module Tests
 *
 * Tests: constants, state init, migration, color helpers,
 *        business logic (getTotalValue, getAssignedValue, etc.),
 *        syncCashItem, persistence
 */

import { assert, assertEqual, assertClose, printSummary } from './helpers.js';

export async function testState({ window, document }) {
    // Dynamic import of production modules (globals already set up)
    const stateMod = await import('../state.js');
    const {
        createDefaultState, getCashItemTemplate, getCashExpenseItemTemplate,
        migrateItem, getPColor, getPBG,
        saveState, loadState, clearSavedState,
        getTotalValue, getParticipantExpenseBoost, getAssignedValue,
        getParticipantLimitBase, getParticipantLimit,
        getAssignedTotal, getUnassignedTotal,
        getItemAllocatedPct, getPrimaryParticipant,
        getRemainingCash, syncCashItem, getState,
        CASH_ITEM_ID, CASH_EXPENSE_ITEM_ID, STORAGE_KEY,
        DEFAULT_NAMES, DEFAULT_COLORS, DEFAULT_BG, SHARES,
    } = stateMod;

    const s = () => getState();

    console.log('\n\u{1F4C1} State Module');

    // ─── Constants ─────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 Constants & Defaults');
        assertEqual(CASH_ITEM_ID, -1, 'CASH_ITEM_ID = -1');
        assertEqual(CASH_EXPENSE_ITEM_ID, -2, 'CASH_EXPENSE_ITEM_ID = -2');
        assertEqual(SHARES.length, 4, '4 shares defined');
        assertEqual(SHARES[0], 1 / 2, 'First share = 1/2');
        assertEqual(DEFAULT_NAMES[0], 'Zuzka', 'Default name: Zuzka');
        assertEqual(DEFAULT_NAMES[3], 'Miro', 'Default name: Miro');
        assertEqual(DEFAULT_COLORS.length, 4, '4 default colors');
        assertEqual(DEFAULT_BG.length, 4, '4 default backgrounds');
    })();

    // ─── createDefaultState ────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 createDefaultState');
        const def = createDefaultState();
        assert(def, 'createDefaultState returns object');
        assertEqual(def.items.length, 0, 'Default has 0 items');
        assertEqual(def.nextItemId, 1, 'nextItemId starts at 1');
        assertEqual(def.participants.length, 4, '4 participants');
        assertEqual(def.participants[0].name, 'Zuzka', 'First participant: Zuzka');
        assertEqual(def.participants[0].share, 1 / 2, 'Zuzka share = 1/2');
        assertEqual(def.participants[1].share, 1 / 6, 'Dana share = 1/6');
        assertEqual(def.cash, 0, 'Cash starts at 0');
        assertEqual(def.expenses.length, 0, 'No expenses initially');
        assertEqual(def.nextExpenseId, 1, 'nextExpenseId starts at 1');
    })();

    // ─── getCashItemTemplate / getCashExpenseItemTemplate ──
    (() => {
        console.log('  \u2500\u2500 Cash templates');
        const cash = getCashItemTemplate();
        assertEqual(cash.id, CASH_ITEM_ID, 'Cash item id = CASH_ITEM_ID');
        assertEqual(cash.name, 'Hotovos\u0165', 'Cash item name');
        assert(cash.isSystem, 'Cash item is system');

        const expCash = getCashExpenseItemTemplate();
        assertEqual(expCash.id, CASH_EXPENSE_ITEM_ID, 'Cash expense item id = CASH_EXPENSE_ITEM_ID');
        assertEqual(expCash.name, 'Hotovos\u0165 na pokrytie n\u00e1kladov', 'Cash expense item name');
        assert(expCash.isSystem, 'Cash expense item is system');
    })();

    // ─── migrateItem ──────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 migrateItem');
        const oldFormat = { id: 1, name: 'Dom', value: 100000, assignedTo: '2' };
        migrateItem(oldFormat);
        assert(!oldFormat.assignedTo, 'assignedTo removed after migration');
        assert(oldFormat.allocations, 'allocations created');
        assertEqual(oldFormat.allocations[0].participantId, 2, 'Participant ID migrated');
        assertEqual(oldFormat.allocations[0].percentage, 100, 'Percentage set to 100');

        const oldNull = { id: 2, name: 'Auto', value: 20000, assignedTo: null };
        migrateItem(oldNull);
        assertEqual(oldNull.allocations.length, 0, 'Null assignedTo -> empty allocations');

        const alreadyNew = { id: 3, name: 'Pozemok', value: 50000, allocations: [{ participantId: 0, percentage: 50 }] };
        migrateItem(alreadyNew);
        assertEqual(alreadyNew.allocations.length, 1, 'Already new format preserved');
        assertEqual(alreadyNew.allocations[0].percentage, 50, 'Percentage preserved');
    })();

    // ─── Color helpers ────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 Color helpers');
        const st = s();
        st.participantColors = [...DEFAULT_COLORS];

        assertEqual(getPColor(0), DEFAULT_COLORS[0], 'getPColor returns default for index 0');
        assertEqual(getPColor(3), DEFAULT_COLORS[3], 'getPColor returns default for index 3');

        st.participantColors[1] = '#ff0000';
        assertEqual(getPColor(1), '#ff0000', 'getPColor returns custom color');
        assertEqual(getPColor(99), '#6366f1', 'getPColor fallback for unknown index');
        assertEqual(getPBG(0), DEFAULT_BG[0], 'getPBG returns default bg');

        st.participantColors = [...DEFAULT_COLORS];
    })();

    // ─── Business Logic ────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 Business Logic');
        const st = s();
        st.items = [];
        st.expenses = [];
        st.cash = 0;

        assertEqual(getTotalValue(), 0, 'getTotalValue = 0 with no items');

        st.items.push({ id: 1, name: 'Dom', value: 100000, allocations: [] });
        st.items.push({ id: 2, name: 'Auto', value: 20000, allocations: [] });

        assertEqual(getTotalValue(), 120000, 'getTotalValue = 120000');
        assertEqual(getAssignedTotal(), 0, 'getAssignedTotal = 0 with no allocations');
        assertEqual(getUnassignedTotal(), 120000, 'getUnassignedTotal = total');

        st.items[0].allocations = [{ participantId: 0, percentage: 50 }];
        st.items[1].allocations = [{ participantId: 1, percentage: 100 }];

        assertEqual(getAssignedValue(0), 50000, 'getAssignedValue(0) = 50% of 100000');
        assertClose(getAssignedValue(1), 20000, 0.01, 'getAssignedValue(1) = 100% of 20000');
        assertEqual(getAssignedTotal(), 70000, 'getAssignedTotal = 50000 + 20000');
        assertClose(getUnassignedTotal(), 50000, 0.01, 'getUnassignedTotal = remainder');

        st.expenses.push({ id: 1, name: 'Pohreb', participantId: 0, value: 5000 });
        assertEqual(getParticipantExpenseBoost(0), 5000, 'Expense boost for participant 0');
        assertEqual(getParticipantExpenseBoost(1), 0, 'No expense boost for participant 1');

        const limitBase = getParticipantLimitBase(0);
        assertEqual(limitBase, 120000 * 0.5, 'Limit base = total * share');

        const limit = getParticipantLimit(0);
        assertEqual(limit, 60000 + 5000, 'Limit = base + expense boost');

        assertEqual(getItemAllocatedPct(st.items[0]), 50, 'getItemAllocatedPct = 50%');
        assertEqual(getPrimaryParticipant(st.items[0]), 0, 'Primary participant = 0');
    })();

    // ─── syncCashItem ─────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 syncCashItem');
        const st = s();
        st.items = [];
        st.cash = 10000;
        st.expenses = [
            { id: 1, name: 'Pohreb', participantId: 0, value: 3000 },
            { id: 2, name: 'Not\u00e1r', participantId: 1, value: 2000 },
        ];

        syncCashItem();

        const cashItem = st.items.find(i => i.id === CASH_ITEM_ID);
        assert(cashItem, 'Cash item exists');
        assertEqual(cashItem.value, 5000, 'Cash item = remaining (10000 - 5000)');
        assertEqual(cashItem.name, 'Hotovos\u0165', 'Cash item name');

        const expenseItem = st.items.find(i => i.id === CASH_EXPENSE_ITEM_ID);
        assert(expenseItem, 'Cash expense item exists');
        assertEqual(expenseItem.value, 5000, 'Expense item = expense cash (min(10000, 5000))');

        const p0Alloc = expenseItem.allocations.find(a => a.participantId === 0);
        const p1Alloc = expenseItem.allocations.find(a => a.participantId === 1);
        assert(p0Alloc, 'Participant 0 has expense allocation');
        assert(p1Alloc, 'Participant 1 has expense allocation');
        assertClose(p0Alloc.percentage, 60, 0.01, 'P0 allocated 60% (3000/5000)');
        assertClose(p1Alloc.percentage, 40, 0.01, 'P1 allocated 40% (2000/5000)');
    })();

    // ─── Persistence ─────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 Persistence');
        const st = s();
        st.items = [
            { id: 1, name: 'Dom', value: 100000, category: 'Nehnute\u013enos\u0165', allocations: [] },
            { id: 2, name: 'Auto', value: 20000, category: 'Doprava', allocations: [{ participantId: 0, percentage: 100 }] },
        ];
        st.nextItemId = 3;
        st.categories = ['Doprava', 'Nehnute\u013enos\u0165'];
        st.cash = 5000;
        st.expenses = [{ id: 1, name: 'Pohreb', participantId: 0, value: 1000 }];
        st.nextExpenseId = 2;

        saveState();

        // Reset state
        st.items = [];
        st.nextItemId = 0;
        st.categories = [];
        st.cash = 0;
        st.expenses = [];
        st.nextExpenseId = 0;

        const loaded = loadState();
        assert(loaded, 'loadState returns true');
        assertEqual(st.items.length, 2, 'Items restored');
        assertEqual(st.nextItemId, 3, 'nextItemId restored');
        assertEqual(st.categories.length, 2, 'Categories restored');
        assertEqual(st.cash, 5000, 'Cash restored');
        assertEqual(st.expenses.length, 1, 'Expenses restored');
        assertEqual(st.nextExpenseId, 2, 'nextExpenseId restored');
        assertEqual(st.items[1].allocations[0].percentage, 100, 'Allocations restored');
        assertEqual(st.participants[0].name, 'Zuzka', 'Participant names preserved');

        clearSavedState();
        assert(!window.localStorage.getItem(STORAGE_KEY), 'clearSavedState removes localStorage item');
    })();

    return printSummary('State Module');
}

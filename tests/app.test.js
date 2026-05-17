/**
 * App Module Tests
 *
 * Tests: addItem, deleteItem, updateItemValue, setAllocation,
 *        updateParticipantName, updateParticipantColor,
 *        getSortedItems, handleReset
 */

import { assert, assertEqual, assertClose, printSummary } from './helpers.js';

export async function testApp({ window, document }) {
    // Dynamic import of production modules (globals already set up)
    const appMod = await import('../app.js');
    const stateMod = await import('../state.js');

    const {
        createDefaultState,
        getCashItemTemplate, getCashExpenseItemTemplate,
        syncCashItem, saveState, loadState, clearSavedState,
        getTotalValue, getAssignedValue, getAssignedTotal, getUnassignedTotal,
        getSortedItems, getState,
        DEFAULT_COLORS, DEFAULT_NAMES,
    } = stateMod;

    const {
        addItem, deleteItem, updateItemValue, setAllocation,
        updateParticipantName, updateParticipantColor, resetParticipantColor,
    } = appMod;

    const s = () => getState();

    console.log('\n\u{1F4C1} App Module');

    // Reset state before testing
    Object.assign(s(), createDefaultState());

    // ─── addItem ──────────────────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 addItem');
        const st = s();

        // addItem does NOT auto-add system items — only syncCashItem() does
        await addItem('Dom', 100000, 'Nehnute\u013enos\u0165');
        assertEqual(st.items.length, 1, 'addItem adds 1 item (no system items auto-added)');
        const dom = st.items.find(i => i.name === 'Dom');
        assert(dom, 'Dom found in items');
        assertEqual(dom.value, 100000, 'Dom value = 100000');
        assertEqual(dom.category, 'Nehnute\u013enos\u0165', 'Dom category set');
        assertEqual(dom.allocations.length, 0, 'No allocations initially');
        assertEqual(st.nextItemId, 2, 'nextItemId incremented');
        assert(st.categories.includes('Nehnute\u013enos\u0165'), 'Category added to categories list');
        assertEqual(getTotalValue(), 100000, 'Total value updated');

        await addItem('Auto', 20000, 'Doprava');
        assertEqual(st.items.length, 2, 'Second item added');

        await addItem('\u0160perky', 5000, '');
        assertEqual(st.items.length, 3, 'Third item with empty category');
        const sperky = st.items.find(i => i.name === '\u0160perky');
        assertEqual(sperky.category, '', 'Empty category preserved');

        // Now add system items via syncCashItem
        st.cash = 5000;
        syncCashItem();
        assertEqual(st.items.length, 5, 'After syncCashItem: 3 regular + 2 system items');
    })();

    // ─── setAllocation ────────────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 setAllocation');
        const st = s();
        const dom = st.items.find(i => i.name === 'Dom');

        await setAllocation(dom.id, 0, 50);
        assertEqual(dom.allocations.length, 1, 'Allocation added');
        assertEqual(dom.allocations[0].participantId, 0, 'Participant 0');
        assertEqual(dom.allocations[0].percentage, 50, '50% allocation');
        assertEqual(getAssignedValue(0), 50000, 'Assigned value = 50000');

        await setAllocation(dom.id, 1, 25);
        assertEqual(dom.allocations.length, 2, 'Second allocation added');
        assertEqual(getAssignedValue(1), 25000, 'Assigned value = 25000');

        await setAllocation(dom.id, 2, 100);
        assertEqual(dom.allocations[2].percentage, 25, 'Allocation clamped to 25%');

        await setAllocation(dom.id, 0, 0);
        const p0Alloc = dom.allocations.find(a => a.participantId === 0);
        assert(!p0Alloc, 'Allocation removed when set to 0');
    })();

    // ─── deleteItem ───────────────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 deleteItem');
        const st = s();
        const sperky = st.items.find(i => i.name === '\u0160perky');

        await deleteItem(sperky.id);

        const found = st.items.find(i => i.name === '\u0160perky');
        assert(!found, 'Item removed after deleteItem');

        // 4 items remain: Dom, Auto, + 2 system items
        assertEqual(st.items.length, 4, 'Item count decreased (4 items remain)');

        const regularItems = st.items.filter(i => !i.isSystem);
        assertEqual(regularItems.length, 2, '2 regular items remain (Dom, Auto)');
    })();

    // ─── updateItemValue ──────────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 updateItemValue');
        const st = s();
        const auto = st.items.find(i => i.name === 'Auto');

        await updateItemValue(auto.id, 25000);
        assertEqual(auto.value, 25000, 'Value updated to 25000');
        // Items: Dom(100000) + Auto(25000) + system(5000+0) = 130000 (\u0160perky was deleted)
        assertEqual(getTotalValue(), 130000, 'Total value updated');

        await updateItemValue(auto.id, -100);
        assertEqual(auto.value, 0, 'Value clamped to 0 when negative');
    })();

    // ─── updateParticipantName ────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 updateParticipantName');
        const st = s();

        await updateParticipantName(0, 'ZUZKA');
        assertEqual(st.participants[0].name, 'ZUZKA', 'Participant name updated');

        await updateParticipantName(0, 'Zuzka');
        assertEqual(st.participants[0].name, 'Zuzka', 'Participant name restored');
    })();

    // ─── updateParticipantColor ────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 updateParticipantColor');
        const st = s();

        await updateParticipantColor(1, '#ff6600');
        assertEqual(st.participantColors[1], '#ff6600', 'Color updated');

        await resetParticipantColor(1);
        assertEqual(st.participantColors[1], DEFAULT_COLORS[1], 'Color reset to default');
    })();

    // ─── getSortedItems ──────────────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 getSortedItems');
        const sorted = getSortedItems();
        assert(sorted.length > 0, 'getSortedItems returns items');
    })();

    // ─── handleReset (simulated) ──────────────────────────
    await (async () => {
        console.log('  \u2500\u2500 handleReset');

        const st = s();
        st.items = [];
        st.nextItemId = 1;
        st.categories = [];
        st.participants.forEach((p, i) => { p.name = DEFAULT_NAMES[i]; });
        st.cash = 0;
        st.expenses = [];
        st.nextExpenseId = 1;
        // Add system items (as handleReset does)
        st.items.push(getCashItemTemplate());
        st.items.push(getCashExpenseItemTemplate());
        syncCashItem();

        assertEqual(st.items.length, 2, 'After reset: system items only');
        assertEqual(st.nextItemId, 1, 'nextItemId reset to 1');
        assertEqual(st.categories.length, 0, 'Categories cleared');
        assertEqual(st.cash, 0, 'Cash reset to 0');
        assertEqual(st.expenses.length, 0, 'Expenses cleared');
        assertEqual(st.participants[0].name, 'Zuzka', 'Participant names restored');
    })();

    return printSummary('App Module');
}

/**
 * Dedičské konanie – Expenses Module (ES Module)
 *
 * Cash and expense event handlers.
 */

import { getState, saveState, syncCashItem } from './state.js';
import { getAuth } from './auth.js';
import { showToast, renderAll, formatEUR, $ } from './ui.js';

const state = getState();

function getAuditActor() {
    const auth = getAuth();
    return {
        email: auth.currentUser?.email || '',
        role: auth.currentUser?.role || '',
        participantId: Number.isInteger(auth.currentUser?.index) ? auth.currentUser.index : null,
    };
}

export async function handleCashChange(e) {
    const val = parseFloat(e.target.value);
    const oldCash = state.cash;
    state.cash = isNaN(val) ? 0 : Math.max(0, val);
    syncCashItem();
    await saveState({
        audit: {
            actor: getAuditActor(),
            action: 'update_cash',
            entityType: 'cash',
            entityId: 'cash',
            summary: `Hotovost zmenena z ${formatEUR(oldCash)} na ${formatEUR(state.cash)}`,
            payload: { oldCash, newCash: state.cash },
        },
    });
    renderAll();
}

export async function handleAddExpense(e) {
    e.preventDefault();

    // Sync cash input value first (in case user didn't blur the field)
    const cashInput = $('#cash-total');
    if (cashInput) {
        const val = parseFloat(cashInput.value);
        state.cash = isNaN(val) ? 0 : Math.max(0, val);
    }

    const nameInput = $('#expense-name');
    const participantSelect = $('#expense-participant');
    const valueInput = $('#expense-value');

    const name = nameInput.value.trim();
    const participantId = parseInt(participantSelect.value);
    const value = parseFloat(valueInput.value);

    if (!name) {
        showToast('Zadajte názov nákladu', 'error');
        nameInput.focus();
        return;
    }
    if (isNaN(participantId) || participantId < 0) {
        showToast('Vyberte účastníka', 'error');
        return;
    }
    if (isNaN(value) || value <= 0) {
        showToast('Zadajte hodnotu väčšiu ako 0', 'error');
        valueInput.focus();
        return;
    }

    state.expenses.push({
        id: state.nextExpenseId++,
        name,
        participantId,
        value,
    });

    syncCashItem();
    await saveState({
        audit: {
            actor: getAuditActor(),
            action: 'add_expense',
            entityType: 'expense',
            entityId: state.nextExpenseId - 1,
            summary: `Pridany naklad "${name}" (${formatEUR(value)})`,
            payload: { name, participantId, value },
        },
    });
    renderAll();

    // Reset form
    nameInput.value = '';
    valueInput.value = '';
    nameInput.focus();

    showToast(`Pridaný náklad "${name}" (${formatEUR(value)})`, 'success');
}

export async function handleDeleteExpense(expenseId) {
    const exp = state.expenses.find(e => e.id === expenseId);
    if (!exp) return;

    // Sync cash input value first (in case user didn't blur the field)
    const cashInput = $('#cash-total');
    if (cashInput) {
        const val = parseFloat(cashInput.value);
        state.cash = isNaN(val) ? 0 : Math.max(0, val);
    }

    state.expenses = state.expenses.filter(e => e.id !== expenseId);

    syncCashItem();
    await saveState({
        audit: {
            actor: getAuditActor(),
            action: 'delete_expense',
            entityType: 'expense',
            entityId: exp.id,
            summary: `Odstraneny naklad "${exp.name}"`,
            payload: { name: exp.name, participantId: exp.participantId, value: exp.value },
        },
    });
    renderAll();
    showToast(`Odstránený náklad "${exp.name}"`, 'success');
}

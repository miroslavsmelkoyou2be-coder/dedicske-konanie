/**
 * Dedičské konanie – Expenses Module (ES Module)
 *
 * Cash and expense event handlers.
 */

import { getState, saveState, syncCashItem } from './state.js';
import { showToast, renderAll, formatEUR, $ } from './ui.js';

const state = getState();

export function handleCashChange(e) {
    const val = parseFloat(e.target.value);
    state.cash = isNaN(val) ? 0 : Math.max(0, val);
    syncCashItem();
    saveState();
    renderAll();
}

export function handleAddExpense(e) {
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
    saveState();
    renderAll();

    // Reset form
    nameInput.value = '';
    valueInput.value = '';
    nameInput.focus();

    showToast(`Pridaný náklad "${name}" (${formatEUR(value)})`, 'success');
}

export function handleDeleteExpense(expenseId) {
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
    saveState();
    renderAll();
    showToast(`Odstránený náklad "${exp.name}"`, 'success');
}

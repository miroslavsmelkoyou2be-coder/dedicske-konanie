/**
 * Dedičské konanie – App Module (ES Module)
 *
 * Event handlers, actions (addItem, setAllocation, etc.), and init.
 * Entry point for the ES module graph.
 */

import {
    getAuth, hashPin, saveAuth, loadAuth, clearAuth, login, logout,
    requestEmailMagicLink,
    isAdmin, isHeir, canEditItems, canEditAllocations, canEditParticipant,
    migrateAuthToHashed, startInactivityTimer, stopInactivityTimer,
    bindActivityListeners, AUTH_VERSION,
} from './auth.js';
import {
    getState, saveState, loadState, clearSavedState,
    getTotalValue, getAssignedValue, getAssignedTotal, getUnassignedTotal,
    getParticipantLimitBase, getParticipantLimit, getParticipantExpenseBoost,
    getPrimaryParticipant, getItemAllocatedPct, getSortedItems,
    getRemainingCash, syncCashItem,
    getPColor, getPBG,
    getCashItemTemplate, getCashExpenseItemTemplate,
    migrateItem, CASH_ITEM_ID, CASH_EXPENSE_ITEM_ID,
    DEFAULT_COLORS, DEFAULT_NAMES, uiState,
} from './state.js';
import {
    $, $$, form, itemNameInput, itemValueInput, itemCategoryInput,
    itemsList, exportBtn, importInput,
    formatEUR, parseEUR, escapeHtml, clamp,
    showToast, showConfirmModal, showPinInputModal,
    renderAuthUI, applyRoleVisibility,
    switchAdminTab, switchHeirTab,
    renderPinsManagement, renderAll, renderItems, renderCashSection,
    renderExpensesSection, renderParticipants, renderCategoryFilter,
} from './ui.js';
import {
    handleCashChange, handleAddExpense, handleDeleteExpense,
} from './expenses.js';

const auth = getAuth();
const state = getState();

// ==============================
// Sort / Filter Handlers
// ==============================
function handleFilterChange(e) {
    uiState.filterCategory = e.currentTarget.value;
    renderItems();
}

function handleSortChange(e) {
    uiState.sortBy = e.currentTarget.value;
    renderItems();
}

function handleSortDirToggle(e) {
    uiState.sortAsc = !uiState.sortAsc;
    const btn = e.currentTarget;
    btn.classList.toggle('sort-desc', !uiState.sortAsc);
    renderItems();
}

// ==============================
// Auth Event Handlers
// ==============================
async function handleChangePin(e) {
    const btn = e.currentTarget;
    const index = parseInt(btn.dataset.index);
    const isAdminLabel = index === 0;
    const label = isAdminLabel ? 'Administratorsky PIN' : `PIN pre ${state.participants[index - 1]?.name || 'dedica'}`;
    const currentPin = isAdminLabel ? auth.adminPin : auth.heirPins[index - 1];

    showPinInputModal({
        title: `Zmenit ${label}`,
        message: `Zadajte novy ${label} (max 6 cislic).${isAdminLabel ? '' : '\\nNechajte prazdne pre zrusenie PIN-u.'}`,
        initialValue: currentPin || '',
        onSubmit: async (trimmed) => {
            if (!trimmed) {
                if (!isAdminLabel) {
                    auth.heirPins[index - 1] = '';
                    await saveAuth();
                    renderPinsManagement();
                    showToast(`PIN pre ${state.participants[index - 1].name} bol zruseny`, 'success');
                }
                return true;
            }

            if (!/^[0-9]{1,6}$/.test(trimmed)) {
                showToast('PIN musi obsahovat iba cislice (max 6)', 'error');
                return false;
            }

            const hashed = await hashPin(trimmed);

            if (isAdminLabel) {
                if (auth.heirPins.includes(hashed)) {
                    showToast('Tento PIN uz pouziva jeden z dedicov', 'error');
                    return false;
                }
            } else if (hashed === auth.adminPin || auth.heirPins.some((p, j) => j !== index - 1 && p === hashed)) {
                showToast('Tento PIN uz pouziva niekto iny', 'error');
                return false;
            }

            if (isAdminLabel) {
                auth.adminPin = hashed;
            } else {
                auth.heirPins[index - 1] = hashed;
            }
            auth.authVersion = AUTH_VERSION;

            await saveAuth();
            renderPinsManagement();
            showToast(`${label} bol zmeneny`, 'success');
            return true;
        },
    });
}

function handleRemovePin(e) {
    const btn = e.currentTarget;
    const index = parseInt(btn.dataset.index);
    if (index === 0) return; // cannot remove admin PIN

    const name = state.participants[index - 1]?.name || 'Dedič';

    showConfirmModal({
        title: 'Zrušiť PIN',
        message: `Naozaj chcete zrušiť PIN pre ${name}? Dedič sa potom nebude môcť prihlásiť.`,
        confirmText: 'Zrušiť PIN',
        onConfirm: async () => {
            auth.heirPins[index - 1] = '';
            await saveAuth();
            renderPinsManagement();
            showToast(`PIN pre ${name} bol zrušený`, 'success');
        },
    });
}

async function handleSetup(e) {
    e.preventDefault();
    const adminPinRaw = $('#setup-admin-pin').value.trim();
    const setupError = $('#setup-error');

    if (!adminPinRaw) {
        setupError.textContent = 'Zadajte administrátorský PIN';
        setupError.classList.add('visible');
        return;
    }

    if (!/^[0-9]{1,6}$/.test(adminPinRaw)) {
        setupError.textContent = 'PIN musí obsahovať iba číslice (max 6)';
        setupError.classList.add('visible');
        return;
    }

    setupError.classList.remove('visible');

    auth.adminPin = await hashPin(adminPinRaw);
    auth.authVersion = AUTH_VERSION;

    // Collect heir PINs
    for (let i = 0; i < 4; i++) {
        const input = document.querySelector(`#setup-heir-${i}`);
        if (input) {
            const val = input.value.trim();
            if (val && /^[0-9]{1,6}$/.test(val)) {
                if (val === adminPinRaw) {
                    showToast(`PIN pre ${state.participants[i].name} už používa niekto iný`, 'warning');
                    continue;
                }
                let duplicate = false;
                for (let j = 0; j < i; j++) {
                    const prevInput = document.querySelector(`#setup-heir-${j}`);
                    if (prevInput && prevInput.value.trim() === val) {
                        showToast(`PIN pre ${state.participants[i].name} už používa niekto iný`, 'warning');
                        duplicate = true;
                        break;
                    }
                }
                if (duplicate) continue;
                auth.heirPins[i] = await hashPin(val);
            } else {
                auth.heirPins[i] = '';
            }
        }
    }

    // Auto-login as admin (save after currentUser for remember-me)
    auth.currentUser = { role: 'admin' };
    await saveAuth();
    startInactivityTimer();
    renderAuthUI();
    renderAll();
    showToast('PIN-y boli uložené. Ste prihlásený ako administrátor.', 'success');
}

async function handleLogin(e) {
    e.preventDefault();
    const pin = $('#login-pin').value.trim();
    const loginError = $('#login-error');
    const rememberMe = $('#login-remember')?.checked ?? true;

    if (!pin) {
        loginError.textContent = 'Zadajte PIN';
        loginError.classList.add('visible');
        return;
    }

    if (await login(pin, rememberMe)) {
        loginError.classList.remove('visible');
        $('#login-pin').value = '';
        renderAuthUI();
        renderAll();

        const role = isAdmin() ? 'ako administrátor' : `ako ${state.participants[auth.currentUser.index].name}`;
        showToast(`Prihlásený ${role}`, 'success');
    } else {
        loginError.textContent = 'Nesprávny PIN. Skúste to znova.';
        loginError.classList.add('visible');
        $('#login-pin').value = '';
        $('#login-pin').focus();
    }
}

async function handleEmailLogin(e) {
    e.preventDefault();
    const email = $('#login-email')?.value.trim() || '';
    const emailError = $('#login-email-error');
    if (!email) {
        if (emailError) {
            emailError.textContent = 'Zadajte email.';
            emailError.classList.add('visible');
        }
        return;
    }
    const result = await requestEmailMagicLink(email);
    if (!result.ok) {
        if (emailError) {
            emailError.textContent = result.error || 'Nepodarilo sa odoslať email.';
            emailError.classList.add('visible');
        }
        return;
    }
    if (emailError) {
        emailError.classList.remove('visible');
    }
    const emailInput = $('#login-email');
    if (emailInput) emailInput.value = '';
    showToast('Poslali sme prihlasovací odkaz na email.', 'success');
}

async function handleLogout(e) {
    if (e) e.preventDefault();
    await logout();
    showToast('Odhlásený', 'success');
}

function handleForgotPin(e) {
    if (e) e.preventDefault();
    showConfirmModal({
        title: 'Zabudnutý PIN',
        message: 'Naozaj chcete vymazať všetky PIN-y? Po potvrdení sa zobrazí úvodné nastavenie, kde si nastavíte nové PIN-y.\\n\\nDáta o majetku a alokáciách ostanú zachované.',
        confirmText: 'Vymazať PIN-y',
        onConfirm: async () => {
            await clearAuth();
            renderAuthUI();
            if (auth.adminPin) {
                renderPinsManagement();
            }
            showToast('PIN-y boli vymazané. Nastavte nové.', 'success');
        },
    });
}

// ==============================
// Actions
// ==============================
export async function addItem(name, value, category) {
    const item = {
        id: state.nextItemId++,
        name: name.trim(),
        value: Math.max(0, value),
        category: category || '',
        allocations: [],
    };
    // Add to known categories if non-empty
    if (item.category && !state.categories.includes(item.category)) {
        state.categories.push(item.category);
        state.categories.sort();
    }
    state.items.push(item);
    await saveState();
    renderAll();
    showToast(`Pridaná položka "${item.name}" v hodnote ${formatEUR(item.value)}`, 'success');
}

export async function deleteItem(itemId) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    state.items = state.items.filter((i) => i.id !== itemId);
    await saveState();
    renderAll();
    showToast(`Odstránená položka "${item.name}"`, 'success');
}

export async function updateItemValue(itemId, newValue) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    // Cash system items are auto-calculated — value change is ignored
    if (item.isSystem) return;
    item.value = Math.max(0, newValue);
    await saveState();
    renderAll();
}

export async function setAllocation(itemId, participantId, percentage) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;

    const pct = clamp(Math.round(percentage * 100000000) / 100000000, 0, 100);

    // Ensure allocations array exists
    if (!Array.isArray(item.allocations)) {
        item.allocations = [];
    }

    // Calculate sum of other participants' allocations (excluding this one)
    const otherSum = item.allocations
        .filter(a => a.participantId !== participantId)
        .reduce((s, a) => s + a.percentage, 0);

    // Calculate max allowed percentage for this participant
    const maxAllowed = Math.max(0, 100 - otherSum);
    const cappedPct = Math.min(pct, maxAllowed);

    if (pct > maxAllowed && maxAllowed > 0) {
        showToast(
            `Hodnota ${pct}% presahuje limit, automaticky znížená na ${cappedPct}%`,
            'warning'
        );
    }

    if (cappedPct === 0) {
        // Remove allocation
        item.allocations = item.allocations.filter(a => a.participantId !== participantId);
        if (pct > 0 && maxAllowed === 0) {
            showToast(
                `Na položke "${item.name}" už nie je voľné miesto (100% je alokovaných)`,
                'warning'
            );
        }
    } else {
        // Find and update, or add new
        const existing = item.allocations.find(a => a.participantId === participantId);
        if (existing) {
            existing.percentage = cappedPct;
        } else {
            item.allocations.push({ participantId, percentage: cappedPct });
        }
    }

    await saveState();
    renderAll();
}

export async function updateParticipantName(participantId, newName) {
    const p = state.participants.find((p) => p.id === participantId);
    if (!p) return;

    const trimmed = newName.trim();
    if (!trimmed) {
        showToast('Meno účastníka nesmie byť prázdne', 'error');
        renderParticipants();
        return;
    }

    p.name = trimmed;
    await saveState();
    renderAll();
}

export async function resetParticipantColor(participantId) {
    const defaultColor = DEFAULT_COLORS[participantId];
    if (!defaultColor) return;
    if (!state.participantColors) {
        state.participantColors = [...DEFAULT_COLORS];
        return;
    }
    state.participantColors[participantId] = defaultColor;
    applyColorVariables();
    await saveState();
    renderAll();
    showToast(`Farba účastníka bola vrátená na predvolenú`, 'success');
}

export async function updateParticipantColor(participantId, newColor) {
    if (!state.participantColors) {
        state.participantColors = [...DEFAULT_COLORS];
    }
    state.participantColors[participantId] = newColor;
    applyColorVariables();
    await saveState();
    renderAll();
}

// ==============================
// Color Variables (applies participant colors to CSS custom properties)
// ==============================
export function applyColorVariables() {
    const root = document.documentElement;
    for (let i = 0; i < state.participants.length; i++) {
        root.style.setProperty(`--p${i + 1}-color`, getPColor(i));
        root.style.setProperty(`--p${i + 1}-bg`, getPBG(i));
    }
}

// ==============================
// Event Handlers
// ==============================
async function handleAddItem(e) {
    e.preventDefault();
    const name = itemNameInput.value.trim();
    const value = parseEUR(itemValueInput.value);

    if (!name) {
        showToast('Zadajte názov položky', 'error');
        itemNameInput.focus();
        return;
    }

    if (value <= 0) {
        showToast('Zadajte hodnotu väčšiu ako 0', 'error');
        itemValueInput.focus();
        return;
    }

    const category = itemCategoryInput.value.trim();
    await addItem(name, value, category);
    form.reset();
    itemNameInput.focus();
}

function handleAllocInput(e) {
    const input = e.currentTarget;
    const maxAllowed = parseFloat(input.dataset.maxAllowed);
    const val = parseFloat(input.value) || 0;
    const field = input.closest('.alloc-field');
    const wrap = input.closest('.alloc-input-wrap');
    if (!field) return;
    if (wrap) {
        const clamped = Math.max(0, Math.min(100, val));
        wrap.style.setProperty('--pct', `${clamped}%`);
        wrap.dataset.pctValue = `${clamped.toFixed(2)}%`;
    }

    field.classList.remove('alloc-near-limit', 'alloc-at-limit');

    if (val >= maxAllowed && maxAllowed > 0) {
        field.classList.add('alloc-at-limit');
    } else if (val >= maxAllowed * 0.8 && maxAllowed > 0) {
        field.classList.add('alloc-near-limit');
    }
}

async function handleAllocationChange(e) {
    const input = e.target;
    const itemId = parseInt(input.dataset.itemId);
    const participantId = parseInt(input.dataset.participantId);
    const pct = parseEUR(input.value);
    await setAllocation(itemId, participantId, pct);
}

function handleDeleteItem(btn) {
    const itemId = parseInt(btn.dataset.itemId);
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;

    showConfirmModal({
        title: 'Odstrániť položku',
        message: `Naozaj chcete odstrániť položku "${item.name}" v hodnote ${item.value.toFixed(2)} €?`,
        confirmText: 'Odstrániť',
        onConfirm: async () => deleteItem(itemId),
    });
}

async function handleValueChange(e) {
    const input = e.currentTarget;
    const itemId = parseInt(input.dataset.itemId);
    const newValue = parseEUR(input.value);
    if (newValue >= 0) {
        await updateItemValue(itemId, newValue);
    } else {
        showToast('Hodnota musí byť kladné číslo', 'error');
        renderItems();
    }
}

function handleParticipantNameClick(nameEl) {
    const participantId = parseInt(nameEl.dataset.participantId);
    const currentName = state.participants[participantId].name;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'participant-name-input';
    input.value = currentName;
    input.dataset.participantId = participantId;
    input.setAttribute('aria-label', 'Meno účastníka');

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    async function commitRename() {
        const newName = input.value.trim();
        const newNameEl = document.createElement('h3');
        newNameEl.className = 'participant-name participant-name-editable';
        newNameEl.id = `participant-name-${participantId}`;
        newNameEl.dataset.participantId = participantId;
        newNameEl.textContent = newName || currentName;
        input.replaceWith(newNameEl);

        if (newName && newName !== currentName) {
            await updateParticipantName(participantId, newName);
        }
    }

    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = currentName;
            input.blur();
        }
    });
}

async function handleExpenseParticipantNameClick(nameEl) {
    const row = nameEl.closest('.expense-row');
    if (!row) return;

    const expenseId = parseInt(row.dataset.expenseId);
    const exp = state.expenses.find(e => e.id === expenseId);
    if (!exp) return;
    if (!canEditParticipant(exp.participantId)) return;

    const currentParticipantId = exp.participantId;
    const select = document.createElement('select');
    select.className = 'expense-participant-select-inline';
    select.setAttribute('aria-label', 'Priradenie dedicovi');

    select.innerHTML = state.participants
        .map(p => `<option value="${p.id}" ${p.id === currentParticipantId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');

    nameEl.replaceWith(select);
    select.focus();

    let handled = false;

    function restore(participantId) {
        const p = state.participants.find(x => x.id === participantId);
        const span = document.createElement('span');
        span.className = 'expense-participant expense-participant-editable';
        span.dataset.participantId = String(participantId);
        span.style.color = getPColor(participantId);
        span.textContent = p ? p.name : '–';
        select.replaceWith(span);
    }

    async function commit() {
        if (handled) return;
        handled = true;

        const nextId = parseInt(select.value);
        if (isNaN(nextId) || nextId === currentParticipantId) {
            restore(currentParticipantId);
            return;
        }

        exp.participantId = nextId;
        syncCashItem();
        await saveState();
        renderAll();

        const p = state.participants.find(x => x.id === nextId);
        showToast(`Naklad "${exp.name}" je teraz priradeny: ${p ? p.name : 'dedic'}`, 'success');
    }

    select.addEventListener('change', commit);
    select.addEventListener('blur', () => {
        if (!handled) restore(currentParticipantId);
    });
    select.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        }
        if (e.key === 'Escape') {
            handled = true;
            restore(currentParticipantId);
        }
    });
}

async function handleParticipantColorChange(e) {
    const input = e.target;
    const participantId = parseInt(input.dataset.participantId);
    await updateParticipantColor(participantId, input.value);
}

function handlePrint(e) {
    e.preventDefault();
    window.print();
}

// ==============================
// Export / Import (was in state.js)
// ==============================
function exportData() {
    const data = {
        items: state.items,
        nextItemId: state.nextItemId,
        categories: state.categories,
        participantNames: state.participants.map(p => p.name),
        participantColors: state.participantColors,
        cash: state.cash,
        expenses: state.expenses,
        nextExpenseId: state.nextExpenseId,
        exportedAt: new Date().toISOString(),
        appVersion: '2.3',
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dedicske-konanie-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Dáta boli exportované', 'success');
}

async function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.items)) {
                showToast('Neplatný súbor – chýbajú položky majetku', 'error');
                return;
            }

            data.items.forEach(migrateItem);
            state.items = data.items;
            state.nextItemId = data.nextItemId || 1;
            state.categories = Array.isArray(data.categories) ? [...data.categories] : [];

            // Ensure each item has a category field
            state.items.forEach(item => {
                if (item.category === undefined) item.category = '';
            });

            // Ensure both persistent cash items exist (migration from imported data)
            if (!state.items.find(i => i.id === CASH_ITEM_ID)) {
                state.items.push(getCashItemTemplate());
            }
            if (!state.items.find(i => i.id === CASH_EXPENSE_ITEM_ID)) {
                state.items.push(getCashExpenseItemTemplate());
            }

            if (Array.isArray(data.participantNames)) {
                data.participantNames.forEach((name, i) => {
                    if (state.participants[i]) {
                        state.participants[i].name = name || DEFAULT_NAMES[i];
                    }
                });
            }

            if (Array.isArray(data.participantColors)) {
                state.participantColors = data.participantColors;
            } else {
                state.participantColors = [...DEFAULT_COLORS];
            }

            // Import cash & expenses
            if (typeof data.cash === 'number') {
                state.cash = data.cash;
            } else {
                state.cash = 0;
            }
            // Support old key 'funeralExpenses' for migration
            const impExpensesData = Array.isArray(data.expenses) ? data.expenses :
                                     (Array.isArray(data.funeralExpenses) ? data.funeralExpenses : null);
            if (impExpensesData) {
                state.expenses = impExpensesData;
            } else {
                state.expenses = [];
            }
            state.nextExpenseId = data.nextExpenseId || 1;

            syncCashItem();
            await saveState();
            renderAll();
            showToast(`Importovaných ${state.items.length} položiek`, 'success');
        } catch (err) {
            showToast('Chyba pri importe – neplatný JSON súbor', 'error');
        }
    };
    reader.readAsText(file);
}

function handleExport(e) {
    e.preventDefault();
    exportData();
}

function handleImportClick(e) {
    e.preventDefault();
    importInput.click();
}

async function handleImportFile(e) {
    const file = e.currentTarget.files[0];
    if (file) {
        await importData(file);
    }
    e.currentTarget.value = '';
}

function handleReset(e) {
    if (e) e.preventDefault();
    if (state.items.length === 0) return;

    showConfirmModal({
        title: 'Vymazať všetky dáta',
        message: 'Naozaj chcete vymazať všetky dáta? Táto akcia je nevratná a všetky položky, alokácie aj mená účastníkov sa stratia.',
        confirmText: 'Vymazať všetko',
        onConfirm: async () => {
            state.items = [];
            state.nextItemId = 1;
            state.categories = [];
            state.participants.forEach((p, i) => { p.name = DEFAULT_NAMES[i]; });
            state.cash = 0;
            state.expenses = [];
            state.nextExpenseId = 1;
            // Recreate the persistent cash item
            state.items.push(getCashItemTemplate());
            state.items.push(getCashExpenseItemTemplate());
            syncCashItem();
            await clearSavedState();
            renderAll();
            showToast('Všetky dáta boli vymazané', 'success');
        },
    });
}

// ==============================
// Init
// ==============================
async function init() {
    // Load auth first
    await loadAuth();

    // Migrate existing plain-text PINs to hashed format
    await migrateAuthToHashed();

    await loadState();

    // Bind auth form events
    $('#setup-form')?.addEventListener('submit', handleSetup);
    $('#login-form')?.addEventListener('submit', handleLogin);
    $('#login-email-form')?.addEventListener('submit', handleEmailLogin);
    $('#logout-btn')?.addEventListener('click', handleLogout);
    $('#header-logout-btn')?.addEventListener('click', handleLogout);
    $('#forgot-pin-btn')?.addEventListener('click', handleForgotPin);

    form.addEventListener('submit', handleAddItem);

    // Sort controls
    const sortSelect = document.querySelector('#sort-select');
    if (sortSelect) {
        sortSelect.value = uiState.sortBy;
        sortSelect.addEventListener('change', handleSortChange);
    }
    const sortDirBtn = document.querySelector('#sort-dir-btn');
    if (sortDirBtn) {
        sortDirBtn.classList.toggle('sort-desc', !uiState.sortAsc);
        sortDirBtn.addEventListener('click', handleSortDirToggle);
    }

    // Filter controls
    const filterSelect = document.querySelector('#filter-category');
    if (filterSelect) {
        filterSelect.addEventListener('change', handleFilterChange);
    }

    // Admin nav tabs
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchAdminTab(tab);
        });
    });

    // Heir nav tabs
    document.querySelectorAll('.heir-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.heirTab;
            switchHeirTab(tab);
        });
    });

    // Cash & Expenses
    $('#cash-total')?.addEventListener('change', handleCashChange);
    $('#expense-form')?.addEventListener('submit', handleAddExpense);

    // Print
    document.querySelector('#print-btn')?.addEventListener('click', handlePrint);

    // Export / Import
    exportBtn.addEventListener('click', handleExport);
    document.querySelector('#import-btn').addEventListener('click', handleImportClick);
    importInput.addEventListener('change', handleImportFile);

    // Reset
    document.querySelector('#reset-btn')?.addEventListener('click', handleReset);

    // Set data-date for print footer
    const appEl = document.querySelector('#app');
    if (appEl) {
        appEl.setAttribute('data-date', new Date().toLocaleDateString('sk-SK', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }));
    }

    // Apply participant colors to CSS variables
    applyColorVariables();
    renderAuthUI();

    // If user is already logged in (e.g. after page reload), render full UI
    if (auth.currentUser) {
        renderAll();
    }

    // Re-apply role visibility after renderAll (ensures correct admin tab sections)
    if (auth.currentUser) {
        applyRoleVisibility();
    }

    // === Delegated events ===

    // Alloc input events (delegated via itemsList)
    itemsList.addEventListener('input', (e) => {
        if (e.target.classList.contains('alloc-input')) {
            handleAllocInput(e);
        }
    });
    itemsList.addEventListener('change', (e) => {
        if (e.target.classList.contains('alloc-input')) {
            handleAllocationChange(e);
        }
    });

    // Item value change (delegated)
    itemsList.addEventListener('change', (e) => {
        if (e.target.classList.contains('item-value-input')) {
            handleValueChange(e);
        }
    });

    // Delete item button (delegated)
    itemsList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete"]');
        if (btn) {
            handleDeleteItem(btn);
        }
    });

    // PIN management buttons (delegated via pins-grid)
    const pinsGrid = $('#pins-grid');
    if (pinsGrid) {
        pinsGrid.addEventListener('click', (e) => {
            const changeBtn = e.target.closest('[data-action="change-pin"]');
            if (changeBtn) handleChangePin(changeBtn);
            const removeBtn = e.target.closest('[data-action="remove-pin"]');
            if (removeBtn) handleRemovePin(removeBtn);
        });
    }

    // Participant tag removal (delegated via participants-grid)
    document.querySelector('#participants-grid').addEventListener('click', async (e) => {
        const tag = e.target.closest('.tag-remove');
        if (tag) {
            const itemId = parseInt(tag.dataset.itemId);
            const participantId = parseInt(tag.dataset.participantId);
            await setAllocation(itemId, participantId, 0);
        }
    });

    // Expense delete (delegated via expense-list)
    document.querySelector('#expense-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.expense-delete');
        if (btn) {
            const id = parseInt(btn.dataset.expenseId);
            await handleDeleteExpense(id);
        }
    });

    // Participant name editing (delegated via participants-grid)
    document.querySelector('#participants-grid').addEventListener('click', (e) => {
        const nameEl = e.target.closest('.participant-name-editable');
        if (nameEl) {
            handleParticipantNameClick(nameEl);
        }
    });

    // Color picker events (delegated)
    document.querySelector('#participants-grid').addEventListener('change', (e) => {
        if (e.target.classList.contains('color-picker-input')) {
            handleParticipantColorChange(e);
        }
    });

    // Color reset events (delegated)
    document.querySelector('#participants-grid').addEventListener('click', async (e) => {
        const btn = e.target.closest('.color-reset');
        if (btn) {
            const participantId = parseInt(btn.dataset.participantId);
            await resetParticipantColor(participantId);
        }
    });

    // Expense participant name editing (delegated)
    document.querySelector('#expense-list')?.addEventListener('click', (e) => {
        const nameEl = e.target.closest('.expense-participant-editable');
        if (nameEl) {
            handleExpenseParticipantNameClick(nameEl);
        }
    });

    // Bind activity listeners for session timeout
    bindActivityListeners();
}

// Boot: wait for DOM and start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

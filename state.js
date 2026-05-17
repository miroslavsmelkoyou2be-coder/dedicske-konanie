/**
 * Dedičské konanie – State Module (ES Module)
 *
 * Pure data module — no imports from other project modules (except supabase).
 * State management, Supabase persistence, business logic.
 */

import { supabase } from './supabase.js';

const isSupabaseDisabled = () => !!globalThis.__DISABLE_SUPABASE__;


// ==============================
// Constants
// ==============================
export const STORAGE_KEY = 'dedicskeKonanie';
export const STORAGE_VERSION = 3; // bumped for allocations model

export const CASH_ITEM_ID = -1;
export const CASH_EXPENSE_ITEM_ID = -2;

export const SHARES = [1/2, 1/6, 1/6, 1/6];
export const SHARE_LABELS = ['1/2', '1/6', '1/6', '1/6'];
export const DEFAULT_NAMES = ['Zuzka', 'Dana', 'Katka', 'Miro'];

export const DEFAULT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899'];
export const DEFAULT_BG = ['#eef2ff', '#fffbeb', '#ecfdf5', '#fdf2f8'];

// ==============================
// UI State (non-persistent, view-only)
// ==============================
export const uiState = {
    sortBy: 'order',
    sortAsc: true,
    filterCategory: 'all',
    adminTab: 'majetok',
    heirTab: 'majetok',
};

// ==============================
// State
// ==============================
export function getCashItemTemplate() {
    return {
        id: CASH_ITEM_ID,
        name: 'Hotovosť',
        value: 0,
        category: 'Hotovosť',
        allocations: [],
        isSystem: true,
    };
}

export function getCashExpenseItemTemplate() {
    return {
        id: CASH_EXPENSE_ITEM_ID,
        name: 'Hotovosť na pokrytie nákladov',
        value: 0,
        category: 'Hotovosť',
        allocations: [],
        isSystem: true,
    };
}

export function createDefaultState() {
    return {
        items: [],
        nextItemId: 1,
        categories: [],
        participants: [
            { id: 0, name: DEFAULT_NAMES[0], share: SHARES[0], label: SHARE_LABELS[0] },
            { id: 1, name: DEFAULT_NAMES[1], share: SHARES[1], label: SHARE_LABELS[1] },
            { id: 2, name: DEFAULT_NAMES[2], share: SHARES[2], label: SHARE_LABELS[2] },
            { id: 3, name: DEFAULT_NAMES[3], share: SHARES[3], label: SHARE_LABELS[3] },
        ],
        participantColors: [...DEFAULT_COLORS],
        cash: 0,
        expenses: [],
        nextExpenseId: 1,
    };
}

let _state = createDefaultState();

export function getState() {
    return _state;
}

// ==============================
// Migration
// ==============================
export function migrateItem(item) {
    // Convert old format (assignedTo) to new format (allocations)
    if (item.assignedTo !== undefined && !Array.isArray(item.allocations)) {
        if (item.assignedTo !== null && item.assignedTo !== '') {
            item.allocations = [{ participantId: parseInt(item.assignedTo), percentage: 100 }];
        } else {
            item.allocations = [];
        }
        delete item.assignedTo;
    }
    if (!Array.isArray(item.allocations)) {
        item.allocations = [];
    }
    return item;
}

// ==============================
// Participant Color helpers
// ==============================
export function getPColor(id) {
    if (_state.participantColors && _state.participantColors[id]) {
        return _state.participantColors[id];
    }
    return DEFAULT_COLORS[id] || '#6366f1';
}

export function getPBG(id) {
    return DEFAULT_BG[id] || '#eef2ff';
}

// ==============================
// Serialization helpers
// ==============================
function serializeState() {
    return {
        storageVersion: STORAGE_VERSION,
        items: _state.items,
        nextItemId: _state.nextItemId,
        categories: _state.categories,
        participantNames: _state.participants.map(p => p.name),
        participantColors: _state.participantColors,
        cash: _state.cash,
        expenses: _state.expenses,
        nextExpenseId: _state.nextExpenseId,
    };
}

function deserializeState(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.items)) return false;

    // Migrate old format (V2: assignedTo) to new (V3: allocations)
    if (Array.isArray(data.items)) {
        data.items.forEach(migrateItem);
    }

    _state.items = data.items || [];
    _state.nextItemId = data.nextItemId || 1;
    _state.categories = Array.isArray(data.categories) ? [...data.categories] : [];

    // Ensure each item has a category field
    _state.items.forEach(item => {
        if (item.category === undefined) item.category = '';
    });

    if (Array.isArray(data.participantNames)) {
        data.participantNames.forEach((name, i) => {
            if (_state.participants[i]) {
                _state.participants[i].name = name || DEFAULT_NAMES[i];
            }
        });
    }

    if (Array.isArray(data.participantColors)) {
        _state.participantColors = data.participantColors;
    } else {
        _state.participantColors = [...DEFAULT_COLORS];
    }

    // Load cash & expenses
    if (typeof data.cash === 'number') {
        _state.cash = data.cash;
    }
    const expensesData = Array.isArray(data.expenses) ? data.expenses :
                         (Array.isArray(data.funeralExpenses) ? data.funeralExpenses : null);
    if (expensesData) {
        _state.expenses = expensesData;
    }
    if (typeof data.nextExpenseId === 'number') {
        _state.nextExpenseId = data.nextExpenseId;
    }

    return true;
}

// ==============================
// Persistence (Supabase + localStorage fallback)
// ==============================
export async function saveState() {
    const serialized = serializeState();

    // Save to Supabase (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
            const { error } = await supabase
                .from('app_data')
                .upsert(
                    { id: 1, data: serialized, updated_at: new Date().toISOString() },
                    { onConflict: 'id' }
                );
            if (error) {
                console.warn('Supabase save error:', error);
            }
        } catch (e) {
            console.warn('Supabase save failed, using localStorage fallback:', e);
        }
    }

    // Also save to localStorage as cache/fallback
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

export async function loadState() {
    // Try Supabase first (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
        const { data, error } = await supabase
            .from('app_data')
            .select('data')
            .eq('id', 1)
            .single();

        if (!error && data?.data) {
            const loaded = deserializeState(data.data);
            if (loaded) {
                console.log('Dáta načítané zo Supabase');
                return true;
            }
        }
        } catch (e) {
            console.warn('Supabase load failed, trying localStorage:', e);
        }
    }

    // Fallback to localStorage
    return fallbackLoadState();
}

function fallbackLoadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);
        const loaded = deserializeState(data);
        if (loaded) {
            console.log('Dáta načítané z localStorage (fallback)');
        }
        return loaded;
    } catch (e) {
        console.warn('localStorage load failed:', e);
        return false;
    }
}

export async function clearSavedState() {
    // Clear Supabase (disabled in tests)
    if (!isSupabaseDisabled()) {
        try {
        await supabase
            .from('app_data')
            .upsert(
                { id: 1, data: {}, updated_at: new Date().toISOString() },
                { onConflict: 'id' }
            );
        } catch (e) {
            console.warn('Supabase clear failed:', e);
        }
    }

    // Clear localStorage
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // ignore
    }
}

// ==============================
// Cash helpers
// ==============================
export function getRemainingCash() {
    const totalExpenses = _state.expenses.reduce((s, e) => s + e.value, 0);
    return Math.max(0, _state.cash - totalExpenses);
}

/**
 * Ensure the persistent 'Hotovosť' item exists and sync its value + allocations.
 */
export function syncCashItem() {
    const totalExpenses = _state.expenses.reduce((s, e) => s + e.value, 0);
    const remainingCash = Math.max(0, _state.cash - totalExpenses);
    const expenseCash = Math.min(_state.cash, totalExpenses);

    // --- Item 1: Hotovosť (id=-1) = zostatok po odrátaní nákladov ---
    let cashItem = _state.items.find(i => i.id === CASH_ITEM_ID);
    if (!cashItem) {
        cashItem = getCashItemTemplate();
        _state.items.push(cashItem);
    }
    cashItem.isSystem = true;
    cashItem.name = 'Hotovosť';
    cashItem.category = 'Hotovosť';
    cashItem.value = remainingCash;
    cashItem.allocations = [];

    // --- Item 2: Hotovosť na pokrytie nákladov (id=-2) ---
    let expenseItem = _state.items.find(i => i.id === CASH_EXPENSE_ITEM_ID);
    if (!expenseItem) {
        expenseItem = getCashExpenseItemTemplate();
        _state.items.push(expenseItem);
    }
    expenseItem.isSystem = true;
    expenseItem.name = 'Hotovosť na pokrytie nákladov';
    expenseItem.category = 'Hotovosť';
    expenseItem.value = expenseCash;

    // Calculate allocations from expenses per participant
    const expenseByParticipant = {};
    _state.expenses.forEach(exp => {
        const key = exp.participantId;
        expenseByParticipant[key] = (expenseByParticipant[key] || 0) + exp.value;
    });

    const expenseAllocations = [];
    if (expenseCash > 0.005) {
        for (const pIdStr in expenseByParticipant) {
            const pId = parseInt(pIdStr);
            const expTotal = expenseByParticipant[pId];
            const pct = (expTotal / expenseCash) * 100;
            if (pct > 0.00000001) {
                expenseAllocations.push({
                    participantId: pId,
                    percentage: Math.round(pct * 100000000) / 100000000,
                });
            }
        }
    }
    expenseItem.allocations = expenseAllocations;
}

// ==============================
// Core Business Logic
// ==============================
export function getTotalValue() {
    return _state.items.reduce((sum, item) => sum + item.value, 0);
}

export function getParticipantExpenseBoost(participantId) {
    return _state.expenses
        .filter(exp => exp.participantId === participantId)
        .reduce((sum, exp) => sum + exp.value, 0);
}

/** Value a participant has claimed via percentage allocations */
export function getAssignedValue(participantId) {
    return _state.items.reduce((sum, item) => {
        const alloc = (item.allocations || []).find(a => a.participantId === participantId);
        return sum + (alloc ? item.value * alloc.percentage / 100 : 0);
    }, 0);
}

export function getParticipantLimitBase(participantId) {
    const total = getTotalValue();
    const p = _state.participants.find(p => p.id === participantId);
    return total * p.share;
}

export function getParticipantLimit(participantId) {
    return getParticipantLimitBase(participantId) + getParticipantExpenseBoost(participantId);
}

/** Total value allocated to any participant */
export function getAssignedTotal() {
    return _state.items.reduce((sum, item) => {
        if (!item.allocations || !item.allocations.length) return sum;
        return sum + item.allocations.reduce((s, a) => s + item.value * a.percentage / 100, 0);
    }, 0);
}

/** Value NOT allocated to anyone */
export function getUnassignedTotal() {
    return _state.items.reduce((sum, item) => {
        const allocatedPct = (item.allocations || []).reduce((s, a) => s + a.percentage, 0);
        const capped = Math.min(allocatedPct, 100);
        return sum + item.value * (100 - capped) / 100;
    }, 0);
}

/** Sum of all allocation percentages on an item */
export function getItemAllocatedPct(item) {
    return (item.allocations || []).reduce((s, a) => s + a.percentage, 0);
}

/** Which participant has the highest allocation on this item (for color-coding) */
export function getPrimaryParticipant(item) {
    if (!item.allocations || !item.allocations.length) return null;
    let max = item.allocations[0];
    item.allocations.forEach(a => {
        if (a.percentage > max.percentage) max = a;
    });
    return max.percentage > 0 ? max.participantId : null;
}

// ==============================
// Sorting (depends on state and uiState)
// ==============================
export function getSortedItems() {
    let items = [..._state.items];

    // Filter by category
    if (uiState.filterCategory !== 'all') {
        items = items.filter(item => item.category === uiState.filterCategory);
    }

    // Sort
    switch (uiState.sortBy) {
        case 'value':
            items.sort((a, b) => uiState.sortAsc ? a.value - b.value : b.value - a.value);
            break;
        case 'name':
            items.sort((a, b) => {
                const cmp = a.name.localeCompare(b.name, 'sk');
                return uiState.sortAsc ? cmp : -cmp;
            });
            break;
        case 'category':
            items.sort((a, b) => {
                const catA = a.category || '';
                const catB = b.category || '';
                if (catA !== catB) {
                    const cmp = catA.localeCompare(catB, 'sk');
                    return uiState.sortAsc ? cmp : -cmp;
                }
                return uiState.sortAsc ? a.id - b.id : b.id - a.id;
            });
            break;
        case 'participant':
            items.sort((a, b) => {
                const aPrim = getPrimaryParticipant(a);
                const bPrim = getPrimaryParticipant(b);
                const aIdx = aPrim !== null ? aPrim : -1;
                const bIdx = bPrim !== null ? bPrim : -1;
                if (aIdx !== bIdx) {
                    return uiState.sortAsc ? aIdx - bIdx : bIdx - aIdx;
                }
                return b.value - a.value;
            });
            break;
        default: // 'order'
            items.sort((a, b) => uiState.sortAsc ? a.id - b.id : b.id - a.id);
            break;
    }

    return items;
}

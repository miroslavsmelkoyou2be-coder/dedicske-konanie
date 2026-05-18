/**
 * Dedičské konanie – UI Module (ES Module)
 *
 * DOM helpers, modals, toasts, and all rendering functions.
 */

import { getAuth, isAdmin, canEditItems, canEditAllocations, canEditParticipant } from './auth.js';
import {
    getState, getPColor, getTotalValue, getAssignedValue, getAssignedTotal,
    getUnassignedTotal, getItemAllocatedPct, getPrimaryParticipant,
    getParticipantLimitBase, getParticipantLimit, getParticipantExpenseBoost,
    getRemainingCash, syncCashItem, getSortedItems,
    CASH_ITEM_ID, CASH_EXPENSE_ITEM_ID, DEFAULT_COLORS,
    uiState,
} from './state.js';

// ==============================
// DOM References
// ==============================
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export const form = $('#add-item-form');
export const itemNameInput = $('#item-name');
export const itemValueInput = $('#item-value');
export const itemCategoryInput = $('#item-category');
export const categoryDatalist = $('#category-datalist');
export const itemsList = $('#items-list');
export const totalValueDisplay = $('#total-value-display');
export const statTotal = $('#stat-total');
export const statAssigned = $('#stat-assigned');
export const statUnassigned = $('#stat-unassigned');
export const barFillAssigned = $('#bar-fill-assigned');
export const barFillUnassigned = $('#bar-fill-unassigned');

export const exportBtn = $('#export-btn');
export const importInput = $('#import-input');

// ==============================
// Helpers
// ==============================
export const formatEUR = (value) => {
    const num = Number(value);
    const isNeg = num < 0;
    const formatted = Math.abs(num).toLocaleString('sk-SK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return (isNeg ? '-' : '') + '€' + formatted;
};

export const parseEUR = (str) => {
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

export function renderCategoryDatalist() {
    if (!categoryDatalist) return;
    categoryDatalist.innerHTML = getState().categories.map(c =>
        `<option value="${escapeHtml(c)}"></option>`
    ).join('');
}

// ==============================
// Toast Notifications
// ==============================
export function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 300ms ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==============================
// Confirm Modal
// ==============================
export function showConfirmModal({ title, message, confirmText, onConfirm }) {
    const modal = document.querySelector('#confirm-modal');
    const titleEl = document.querySelector('#modal-title');
    const messageEl = document.querySelector('#modal-message');
    const confirmTextEl = document.querySelector('#modal-confirm-text');
    const confirmBtn = document.querySelector('#modal-confirm-btn');
    const cancelBtn = document.querySelector('#modal-cancel-btn');
    const closeBtn = document.querySelector('#modal-close');

    if (!modal) return;
    if (modal.classList.contains('open')) return;

    // Set content
    titleEl.textContent = title || 'Potvrdenie akcie';
    messageEl.textContent = message || 'Naozaj chcete pokračovať?';
    confirmTextEl.textContent = confirmText || 'Potvrdiť';

    // Cleanup function
    function closeModal() {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        // Remove event listeners
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', closeModal);
        closeBtn.removeEventListener('click', closeModal);
        document.removeEventListener('keydown', handleKeydown);
        modal.removeEventListener('click', handleOverlayClick);
    }

    function handleConfirm() {
        closeModal();
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
        if (e.key === 'Enter' && e.target === modal) {
            handleConfirm();
        }
    }

    function handleOverlayClick(e) {
        if (e.target === modal) {
            closeModal();
        }
    }

    // Bind events
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', handleKeydown);
    modal.addEventListener('click', handleOverlayClick);

    // Show modal
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    // Focus confirm button
    setTimeout(() => confirmBtn.focus(), 50);
}

// ==============================
// Auth UI
// ==============================
export function renderAuthUI() {
    const loginOverlay = $('#login-overlay');
    const headerUserInfo = $('#header-user-info');
    const headerUserBadge = $('#header-user-badge');

    const a = getAuth();
    if (!a.currentUser) {
        // Not logged in – show login
        if (loginOverlay) {
            loginOverlay.style.display = 'flex';
            loginOverlay.setAttribute('aria-hidden', 'false');
            // Focus email input
            setTimeout(() => $('#login-email')?.focus(), 100);
        }
        if (headerUserInfo) headerUserInfo.style.display = 'none';
    } else {
        // Logged in – show app
        if (loginOverlay) {
            loginOverlay.style.display = 'none';
            loginOverlay.setAttribute('aria-hidden', 'true');
        }
        // Show user info in header
        if (headerUserInfo) {
            headerUserInfo.style.display = 'flex';
        }
        if (headerUserBadge) {
            if (isAdmin()) {
                headerUserBadge.textContent = '👑 Administrátor';
            } else {
                const p = getState().participants[a.currentUser.index];
                headerUserBadge.textContent = p ? `Prihlásený ako ${p.name}` : 'Dedič';
            }
        }
        // Reset heir tab on login and apply role-based visibility
        uiState.heirTab = 'majetok';
        // Reset heir-nav button active states
        document.querySelectorAll('.heir-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.heirTab === uiState.heirTab);
        });
        applyRoleVisibility();
    }
}

export function applyRoleVisibility() {
    const addForm = $('#add-item-section');
    const actions = document.querySelector('.card-actions');
    const pinsSection = $('#pins-section');
    const userAuditSection = $('#user-audit-section');
    const cashSection = $('#cash-section');
    const expensesSection = $('#expenses-section');
    const itemsSection = $('#items-section');
    const participantsSection = $('#participants-section');
    const summaryBar = $('#summary-bar');
    const adminNav = $('#admin-nav');

    if (isAdmin()) {
        // Show admin nav
        if (adminNav) adminNav.style.display = '';

        // Helper to toggle display
        const show = (el) => { if (el) el.style.display = ''; };
        const hide = (el) => { if (el) el.style.display = 'none'; };

        // Ensure heir-nav is hidden for admin
        const heirNav = $('#heir-nav');
        if (heirNav) heirNav.style.display = 'none';

        // Hide all tab-content sections first
        hide(addForm);
        hide(actions);
        hide(pinsSection);
        hide(userAuditSection);
        hide(cashSection);
        hide(expensesSection);
        hide(itemsSection);
        hide(participantsSection);
        hide(summaryBar);    // Show only sections for the active tab
            switch (uiState.adminTab) {
                case 'majetok':
                    show(addForm);
                    show(actions);
                    show(itemsSection);
                    show(participantsSection);
                    show(summaryBar);
                    show(cashSection);
                    if (expensesSection) expensesSection.style.borderLeft = '';
                    // Ensure all cash section children are visible
                    const cashTotalRowMaj = document.querySelector('.cash-total-row');
                    const cashRemainingRow = document.querySelector('.cash-remaining-row');
                    if (cashTotalRowMaj) cashTotalRowMaj.style.display = '';
                    if (cashRemainingRow) cashRemainingRow.style.display = '';
                    const cashHeader = document.querySelector('#cash-section > .card-header');
                    if (cashHeader) cashHeader.style.display = '';
                    break;
                case 'naklady':
                    if (cashSection) {
                        cashSection.style.display = '';
                        // Hide the card header and remaining row on naklady tab, keep cash input
                        const cashHeaderNak = document.querySelector('#cash-section > .card-header');
                        if (cashHeaderNak) cashHeaderNak.style.display = 'none';
                        const cashRemainingRowNak = document.querySelector('.cash-remaining-row');
                        if (cashRemainingRowNak) cashRemainingRowNak.style.display = 'none';
                        const cashTotalRowNak = document.querySelector('.cash-total-row');
                        if (cashTotalRowNak) cashTotalRowNak.style.display = '';
                    }
                    if (expensesSection) expensesSection.style.borderLeft = 'none';
                    const expenseFormNak = $('#expense-form');
                    if (expenseFormNak) expenseFormNak.style.display = '';
                    show(expensesSection);
                    break;
                case 'access':
                    show(pinsSection);
                    break;
                case 'audit':
                    show(userAuditSection);
                    break;
            }
    } else {
        // Heir – hide admin-only sections, show heir-nav with tab switching
        const heirNav = $('#heir-nav');
        if (adminNav) adminNav.style.display = 'none';
        if (heirNav) heirNav.style.display = '';
        if (addForm) addForm.style.display = 'none';
        if (actions) actions.style.display = 'none';
        if (pinsSection) pinsSection.style.display = 'none';
        if (userAuditSection) userAuditSection.style.display = 'none';

        // Hide admin-only parts (cash input + add expense form)
        const cashTotalRow = document.querySelector('.cash-total-row');
        const expenseForm = $('#expense-form');
        if (cashTotalRow) cashTotalRow.style.display = 'none';
        if (expenseForm) expenseForm.style.display = 'none';

        // Show/hide sections based on heirTab
        if (uiState.heirTab === 'majetok') {
            if (itemsSection) itemsSection.style.display = '';
            if (participantsSection) participantsSection.style.display = '';
            if (summaryBar) summaryBar.style.display = '';
            if (cashSection) cashSection.style.display = 'none';
            if (expensesSection) expensesSection.style.borderLeft = '';
            if (expensesSection) expensesSection.style.display = 'none';
        } else {
            // heirTab === 'naklady'
            if (itemsSection) itemsSection.style.display = 'none';
            if (participantsSection) participantsSection.style.display = 'none';
            if (summaryBar) summaryBar.style.display = 'none';
            if (cashSection) cashSection.style.display = 'none';
            if (expensesSection) expensesSection.style.borderLeft = 'none';
            if (expensesSection) expensesSection.style.display = '';
        }
    }
}

export function switchAdminTab(tab) {
    uiState.adminTab = tab;

    // Update active button state
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    applyRoleVisibility();

    // Render relevant sections for the active tab
    switch (tab) {
        case 'majetok':
            syncCashItem(); // ensure system item is up-to-date
            renderAll();
            break;
        case 'naklady':
            renderCashSection();
            renderExpensesSection();
            break;
        case 'access':
            break;
        case 'audit':
            break;
    }
}

export function switchHeirTab(tab) {
    uiState.heirTab = tab;

    // Update active button state
    document.querySelectorAll('.heir-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.heirTab === tab);
    });

    applyRoleVisibility();

    // Render relevant sections for the active tab
    switch (tab) {
        case 'majetok':
            syncCashItem();
            renderAll();
            break;
        case 'naklady':
            renderCashSection();
            renderExpensesSection();
            break;
    }
}


// ==============================
// Rendering
// ==============================
export function renderItems() {
    if (getState().items.length === 0) {
        itemsList.innerHTML = `
            <div class="items-empty">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.3">
                    <rect x="8" y="14" width="32" height="24" rx="3" stroke="currentColor" stroke-width="2"/>
                    <path d="M18 14V10a2 2 0 012-2h8a2 2 0 012 2v4" stroke="currentColor" stroke-width="2"/>
                    <path d="M16 24h16M16 30h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>Zatiaľ nebol pridaný žiadny majetok.</p>
                <p class="text-muted">Pridajte položky pomocou formulára vyššie.</p>
            </div>
        `;
        return;
    }

    const sorted = getSortedItems();
    let html = '';
    sorted.forEach((item) => {
        const primary = getPrimaryParticipant(item);
        const allocPct = getItemAllocatedPct(item);
        const isOverallocated = allocPct > 100.01;

        // System item: show special badge and disable editing
        const isSystemItem = item.isSystem === true;
        const isCashItem = item.id === CASH_ITEM_ID;
        const isCashExpenseItem = item.id === CASH_EXPENSE_ITEM_ID;

        // Build allocation inputs for each participant
        let allocHtml = '';
        getState().participants.forEach((p) => {
            const alloc = (item.allocations || []).find(a => a.participantId === p.id);
            const pct = alloc ? alloc.percentage : 0;
            const allocationValue = item.value * pct / 100;
            const fillColor = getPColor(p.id);

            // Calculate max allowed for this participant on this item
            const otherSum = (item.allocations || [])
                .filter(a => a.participantId !== p.id)
                .reduce((s, a) => s + a.percentage, 0);
            const maxAllowed = Math.max(0, 100 - otherSum);

            // Visual state: approaching limit
            let limitClass = '';
            if (pct >= maxAllowed && maxAllowed > 0) {
                limitClass = ' alloc-at-limit';
            } else if (pct >= maxAllowed * 0.8 && maxAllowed > 0) {
                limitClass = ' alloc-near-limit';
            }

            const isAllocationEditableSystemItem = isCashItem;
            const inputDisabled = !canEditAllocations(p.id) || (isSystemItem && !isAllocationEditableSystemItem);
            const allocControlHtml = isCashExpenseItem
                ? `<div class="alloc-input-wrap alloc-value-wrap" data-pct-value="${formatEUR(allocationValue)}" style="--pct:${Math.max(0, Math.min(100, pct)).toFixed(2)}%;">
                        <span class="alloc-value-readonly">${formatEUR(allocationValue)}</span>
                   </div>`
                : `<div class="alloc-input-wrap" data-pct-value="${pct.toFixed(2)}%" style="--pct:${Math.max(0, Math.min(100, pct)).toFixed(2)}%;">
                        <input type="number" class="alloc-input" value="${pct.toFixed(2)}"
                            min="0" max="${maxAllowed}" step="0.00000001"
                            data-item-id="${item.id}" data-participant-id="${p.id}"
                            data-max-allowed="${maxAllowed}"
                            title="${inputDisabled ? 'Nementieľné – iba administrátor alebo daný dedič' : `Voľné miesto: ${maxAllowed.toFixed(2)}%`}"
                            ${inputDisabled ? 'disabled' : ''} />
                        <span class="alloc-suffix">%</span>
                   </div>`;
            allocHtml += `
                <div class="alloc-field${limitClass}" style="--alloc-color: ${fillColor};">
                    <span class="alloc-label">${escapeHtml(p.name.slice(0, 10))}</span>
                    ${allocControlHtml}
                </div>
            `;
        });

        // Build multi-colored progress bar segments
        let barSegments = '';
        const allocs = item.allocations || [];
        // Sort allocations so segments appear in participant order (0,1,2,3)
        const sortedAllocs = [...allocs].filter(a => a.percentage > 0).sort((a, b) => a.participantId - b.participantId);
        if (sortedAllocs.length > 0) {
            sortedAllocs.forEach(a => {
                const color = getPColor(a.participantId);
                barSegments += `<div class="alloc-bar-seg" style="width: ${a.percentage}%; background: ${color};"></div>`;
            });
            // Add empty space for unallocated portion (if any)
            const remaining = Math.max(0, 100 - allocPct);
            if (remaining > 0.5) {
                barSegments += `<div class="alloc-bar-seg alloc-bar-empty" style="width: ${remaining}%;"></div>`;
            }
        }

        // Category tag (neutral style)
        const displayName = isCashItem
            ? 'Hotovosť - zostatok'
            : (isCashExpenseItem ? 'Hotovosť - na pokrytie nákladov' : item.name);
        const catHtml = item.category && !isCashItem && !isCashExpenseItem
            ? `<span class="item-category">${escapeHtml(item.category)}</span>`
            : '';

        // Cash system items are auto-calculated — not editable inline
        const canEditValue = canEditItems() && !isSystemItem;
        const canDelete = canEditItems() && !isSystemItem;
        const useBottomMeta = true;
        const valueHtml = canEditValue
            ? `<span class="item-value-edit" data-value="${item.value.toFixed(2)} €">
                    <input type="number" class="item-value-input" value="${item.value.toFixed(2)}" min="0" step="0.00000001" inputmode="decimal" data-item-id="${item.id}" />
                    <span style="font-size:0.75rem;color:var(--text-muted)">€</span>
                </span>`
            : `<span style="font-weight:600;">${formatEUR(item.value)}</span>`;

        const actionsHtml = canDelete
            ? `<span class="item-actions">
                    <button class="btn btn-danger" data-action="delete" data-item-id="${item.id}" title="Odstrániť položku">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </span>`
            : '';

        const allocRightMetaHtml = useBottomMeta
            ? `<div class="item-row-alloc-right">
                    <span class="item-value">${valueHtml}</span>
                    <span class="item-alloc-summary item-alloc-summary-emph ${isOverallocated ? 'over' : ''}" style="--pct:${Math.max(0, Math.min(100, allocPct)).toFixed(2)}%;">${isCashExpenseItem ? formatEUR(item.value * Math.min(allocPct, 100) / 100) : `${allocPct.toFixed(2)}%`}</span>
               </div>`
            : '';

        html += `
            <div class="item-row" data-item-id="${item.id}">
                <div class="item-row-main">
                    <span class="item-name">${escapeHtml(displayName)}${catHtml}</span>
                    ${useBottomMeta ? '' : `<span class="item-value">${valueHtml}</span>`}
                    ${useBottomMeta ? '' : `<span class="item-alloc-summary ${isOverallocated ? 'over' : ''}">${allocPct.toFixed(2)}%</span>`}
                    ${actionsHtml}
                </div>
                <div class="item-row-allocations">
                    <div class="item-row-alloc-left">${allocHtml}</div>
                    ${allocRightMetaHtml}
                </div>
            </div>
        `;
    });

    itemsList.innerHTML = html;
}

export function renderParticipants() {
    const total = getTotalValue();

    getState().participants.forEach((p) => {
        const limitBase = getParticipantLimitBase(p.id);
        const limitBoost = getParticipantExpenseBoost(p.id);
        const limit = getParticipantLimit(p.id);
        const used = getAssignedValue(p.id);
        const remaining = limit - used;
        const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

        const limitEl = document.getElementById(`limit-${p.id}`);
        const usedEl = document.getElementById(`used-${p.id}`);
        const remainingEl = document.getElementById(`remaining-${p.id}`);
        const progressEl = document.getElementById(`progress-${p.id}`);
        const itemsContainer = document.getElementById(`participant-items-${p.id}`);
        const nameEl = document.getElementById(`participant-name-${p.id}`);

        const canEditPart = canEditParticipant(p.id);

        if (nameEl) {
            nameEl.textContent = p.name;
            nameEl.dataset.default = p.name;
            // Only editable participants get the click handler
            if (canEditPart) {
                nameEl.style.cursor = 'pointer';
                nameEl.classList.add('participant-name-editable');
            } else {
                nameEl.style.cursor = 'default';
                nameEl.classList.remove('participant-name-editable');
            }
        }

        // Render color picker
        const colorWrap = document.getElementById(`participant-color-${p.id}`);
        if (colorWrap) {
            const color = getPColor(p.id);
            const isDefault = color === DEFAULT_COLORS[p.id];
            if (canEditPart) {
                colorWrap.innerHTML = `
                    <input type="color" class="color-picker-input" id="color-input-${p.id}"
                        value="${color}" data-participant-id="${p.id}" />
                    <label for="color-input-${p.id}" class="color-swatch"
                        style="background: ${color};" data-participant-id="${p.id}"
                        title="Zmeniť farbu účastníka"></label>
                    <button class="color-reset${isDefault ? ' hidden' : ''}" type="button"
                        data-participant-id="${p.id}" title="Vrátiť predvolenú farbu">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8a5 5 0 019.9-2M13 8a5 5 0 01-9.9 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M13 3v3h-3M3 13v-3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                `;
            } else {
                // Show static dot for non-editable participants
                colorWrap.innerHTML = `<span class="color-swatch" style="background: ${color}; cursor: default; width: 14px; height: 14px;"></span>`;
            }
        }

        if (limitEl) {
            if (limitBoost > 0.001) {
                limitEl.innerHTML = `
                    <span class="limit-base">${formatEUR(limitBase)}</span>
                    <span class="limit-plus"> + </span>
                    <span class="limit-boost">${formatEUR(limitBoost)}</span>
                `;
            } else {
                limitEl.textContent = formatEUR(limitBase);
            }
        }
        if (usedEl) usedEl.textContent = formatEUR(used);
        if (remainingEl) {
            remainingEl.textContent = formatEUR(remaining);
            const row = remainingEl.closest('.limit-row');
            if (row) {
                row.classList.toggle('over-limit', remaining < -0.001);
            }
        }
        if (progressEl) {
            progressEl.style.width = `${percentage}%`;
            progressEl.classList.toggle('over-limit', remaining < -0.001);
        }

        if (itemsContainer) {
            // Items where this participant has an allocation
            const allocatedItems = getState().items.filter((item) =>
                (item.allocations || []).some(a => a.participantId === p.id && a.percentage > 0)
            );
            if (allocatedItems.length === 0) {
                itemsContainer.innerHTML = '<p class="text-muted small">Zatiaľ žiadne položky</p>';
            } else {
                let html = '';
                allocatedItems.forEach((item) => {
                    const alloc = item.allocations.find(a => a.participantId === p.id);
                    const allocValue = item.value * alloc.percentage / 100;
                    html += `
                        <span class="participant-item-tag">
                            <span>${escapeHtml(item.name)}</span>
                            <span class="tag-value">${alloc.percentage.toFixed(2)}% (${formatEUR(allocValue)})</span>
                            <span class="tag-remove" data-item-id="${item.id}" data-participant-id="${p.id}" title="Odobrať alokáciu">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                            </span>
                        </span>
                    `;
                });
                itemsContainer.innerHTML = html;
            }
        }
    });
}

export function renderSummary() {
    const total = getTotalValue();
    const assigned = getAssignedTotal();
    const unassigned = getUnassignedTotal();
    const count = getState().items.length;

    totalValueDisplay.innerHTML = `Počet položiek: <strong id="items-count-display">${count}</strong>`;

    if (statTotal) statTotal.textContent = formatEUR(total);
    if (statAssigned) statAssigned.textContent = formatEUR(assigned);
    if (statUnassigned) statUnassigned.textContent = formatEUR(unassigned);

    // Update progress bar (assigned vs unassigned)
    if (barFillAssigned && barFillUnassigned && total > 0) {
        const assignedPct = Math.min((assigned / total) * 100, 100);
        const unassignedPct = Math.min((unassigned / total) * 100, 100);
        barFillAssigned.style.width = `${assignedPct}%`;
        barFillUnassigned.style.width = `${unassignedPct}%`;
    } else if (barFillAssigned && barFillUnassigned) {
        barFillAssigned.style.width = '0%';
        barFillUnassigned.style.width = '0%';
    }
}

export function renderAll() {
    renderItems();
    renderParticipants();
    renderSummary();
    renderCategoryDatalist();
    renderCategoryFilter();
    renderCashSection();
    renderExpensesSection();
}

export function renderCategoryFilter() {
    const filterSelect = document.querySelector('#filter-category');
    if (!filterSelect) return;

    // Remember current selection
    const current = filterSelect.value;

    filterSelect.innerHTML = '<option value="all">Všetky kategórie</option>';

    // Add each known category
    const usedCategories = [...new Set(getState().items.map(item => item.category).filter(c => c))];
    usedCategories.sort((a, b) => a.localeCompare(b, 'sk'));

    usedCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        filterSelect.appendChild(opt);
    });

    // Restore selection if still valid, otherwise reset to 'all'
    if ([...filterSelect.options].some(o => o.value === current)) {
        filterSelect.value = current;
    } else {
        filterSelect.value = 'all';
        uiState.filterCategory = 'all';
    }
}

// ==============================
// Cash & Expenses Rendering
// ==============================
export function renderCashSection() {
    const section = $('#cash-section');
    if (!section) return;

    // Update cash input – compare stringified values to avoid floating point drift
    const cashInput = $('#cash-total');
    if (cashInput && cashInput.value !== getState().cash.toFixed(2)) {
        cashInput.value = getState().cash.toFixed(2);
    }

    // Update remaining cash display
    const remaining = getRemainingCash();
    const remainingEl = $('#cash-remaining');
    if (remainingEl) remainingEl.textContent = formatEUR(remaining);
}

export function renderExpensesSection() {
    const section = $('#expenses-section');
    if (!section) return;

    // Render expenses list
    const expenseList = $('#expense-list');
    if (!expenseList) return;

    if (getState().expenses.length === 0) {
        expenseList.innerHTML = '<p class="text-muted small" style="padding: 0.5rem 0;">Zatiaľ žiadne náklady.</p>';
    } else {
        let html = '';
        getState().expenses.forEach(exp => {
            const p = getState().participants.find(p => p.id === exp.participantId);
            const canDelete = isAdmin();
            const canEditName = canEditParticipant(exp.participantId);
            html += `
                <div class="expense-row" data-expense-id="${exp.id}">
                    <span class="expense-name">${escapeHtml(exp.name)}</span>
                    <span class="expense-participant ${canEditName ? 'expense-participant-editable' : ''}" data-participant-id="${exp.participantId}" style="color: ${getPColor(exp.participantId)};">${escapeHtml(p ? p.name : '–')}</span>
                    <span class="expense-value">${formatEUR(exp.value)}</span>
                    ${canDelete ? `
                    <button class="expense-delete" data-expense-id="${exp.id}" title="Odstrániť náklad">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>` : ''}
                </div>
            `;
        });
        expenseList.innerHTML = html;
    }

    // Update participant select in add form
    const select = $('#expense-participant');
    if (select) {
        const currentVal = select.value;
        select.innerHTML = getState().participants.map(p =>
            `<option value="${p.id}">${escapeHtml(p.name)}</option>`
        ).join('');
        select.value = currentVal;
    }
}

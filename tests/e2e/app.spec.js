/**
 * Dedičské konanie – End-to-End Playwright Tests
 *
 * Covers the full user flow:
 *   1. Setup (first run) — enter admin + heir PINs
 *   2. Add items with categories
 *   3. Set cash total and add expenses
 *   4. Set allocations on items
 *   5. Verify summary, participant limits, progress bars
 *   6. Sort and filter items
 *   7. Rename participants, change colors
 *   8. Tab switching (náklady, správa PIN)
 *   9. Logout and login as admin / heir
 *  10. Change/remove PINs via správa PIN
 *  11. Forgot PIN flow (clear all PINs)
 *  12. Reset all data
 *  13. Export/Import
 *  14. Persistence after reload
 */

import { test, expect } from '@playwright/test';

const ADMIN_PIN = '1234';
const HEIR1_PIN = '5678';

// Helper: clear localStorage
async function clearStorage(page) {
    await page.evaluate(() => localStorage.clear());
}

// Helper: fresh app start with cleared storage
async function freshStart(page) {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await page.waitForTimeout(800);
}

// Helper: setup admin (and optionally heir) from clean state
async function setupAdmin(page, heirPin) {
    await freshStart(page);
    await page.locator('#setup-admin-pin').fill(ADMIN_PIN);
    if (heirPin) {
        await page.locator('#setup-heir-0').fill(heirPin);
    }
    await page.locator('#setup-form').getByRole('button', { name: 'Uložiť' }).click();
    await page.waitForTimeout(800);
    await expect(page.locator('#header-user-badge')).toContainText('Administrátor', { timeout: 5000 });
}

// Helper: switch to admin tab
async function switchAdminTab(page, tab) {
    await page.locator(`.admin-nav-btn[data-tab="${tab}"]`).click();
    await page.waitForTimeout(300);
}

// Helper: add an item
async function addItem(page, name, value, category) {
    if (category) {
        await page.locator('#item-name').fill(name);
        await page.locator('#item-category').fill(category);
    } else {
        await page.locator('#item-name').fill(name);
    }
    await page.locator('#item-value').fill(String(value));
    await page.locator('#add-btn').click();
    await page.waitForTimeout(600);
}

// ============================================================
// 1. Setup & Authentication
// ============================================================
test.describe('Setup & Authentication', () => {

    test('should show setup overlay on first run', async ({ page }) => {
        await freshStart(page);
        await expect(page.locator('#setup-overlay')).toBeVisible();
        await expect(page.locator('#setup-overlay')).toHaveAttribute('aria-hidden', 'false');
        await expect(page.locator('#setup-admin-pin')).toBeVisible();
        await expect(page.locator('#setup-form')).toContainText('Uložiť a pokračovať');
    });

    test('should set up admin PIN only and auto-login', async ({ page }) => {
        await freshStart(page);
        await page.locator('#setup-admin-pin').fill(ADMIN_PIN);
        await page.locator('#setup-form').getByRole('button', { name: 'Uložiť' }).click();
        await page.waitForTimeout(800);

        await expect(page.locator('#setup-overlay')).not.toBeVisible();
        await expect(page.locator('#header-user-badge')).toContainText('Administrátor');
        await expect(page.locator('#add-item-section')).toBeVisible();
        await expect(page.locator('#admin-nav')).toBeVisible();
        await expect(page.locator('#login-overlay')).not.toBeVisible();
    });

    test('should set up with admin + heir PINs', async ({ page }) => {
        await freshStart(page);
        await page.locator('#setup-admin-pin').fill(ADMIN_PIN);
        await page.locator('#setup-heir-0').fill(HEIR1_PIN);
        await page.locator('#setup-form').getByRole('button', { name: 'Uložiť' }).click();
        await page.waitForTimeout(800);

        await expect(page.locator('#header-user-badge')).toContainText('Administrátor');
    });

    test('should logout and login with admin PIN', async ({ page }) => {
        await setupAdmin(page);

        // Logout via header
        await page.locator('#header-logout-btn').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#login-overlay')).toBeVisible();

        // Login as admin
        await page.locator('#login-pin').fill(ADMIN_PIN);
        await page.locator('#login-form').getByRole('button', { name: 'Prihlásiť' }).click();
        await page.waitForTimeout(800);

        await expect(page.locator('#header-user-badge')).toContainText('Administrátor');
        await expect(page.locator('#login-overlay')).not.toBeVisible();
    });

    test('should fail login with wrong PIN', async ({ page }) => {
        await setupAdmin(page);

        // Logout
        await page.locator('#header-logout-btn').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#login-overlay')).toBeVisible();

        // Wrong PIN
        await page.locator('#login-pin').fill('9999');
        await page.locator('#login-form').getByRole('button', { name: 'Prihlásiť' }).click();
        await page.waitForTimeout(500);

        await expect(page.locator('#login-error')).toBeVisible();
        await expect(page.locator('#login-error')).toContainText('Nesprávny PIN');
    });

    test('should login as heir', async ({ page }) => {
        await setupAdmin(page, HEIR1_PIN);

        // Logout
        await page.locator('#header-logout-btn').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#login-overlay')).toBeVisible();

        // Login as heir (Zuzka)
        await page.locator('#login-pin').fill(HEIR1_PIN);
        await page.locator('#login-form').getByRole('button', { name: 'Prihlásiť' }).click();
        await page.waitForTimeout(800);

        await expect(page.locator('#header-user-badge')).toContainText('Zuzka');
        await expect(page.locator('#add-item-section')).not.toBeVisible();
        await expect(page.locator('#heir-nav')).toBeVisible();
    });
});

// ============================================================
// 2. Full App Flow
// ============================================================
test.describe('Full App Flow', () => {

    test.beforeEach(async ({ page }) => {
        await setupAdmin(page, HEIR1_PIN);
    });

    test('should add items and verify counters', async ({ page }) => {
        await addItem(page, 'Rodinný dom', 100000, 'Nehnuteľnosť');
        await expect(page.locator('#items-count-display')).toHaveText('1', { timeout: 5000 });
        await expect(page.locator('#items-list')).toContainText('Rodinný dom');

        await addItem(page, 'Automobil', 20000, 'Doprava');
        await expect(page.locator('#items-count-display')).toHaveText('2', { timeout: 5000 });
        await expect(page.locator('#items-list')).toContainText('Automobil');

        // Summary bar should show total
        await expect(page.locator('#stat-total')).toContainText('120');
    });

    test('should set cash and add expenses', async ({ page }) => {
        // Navigate to Náklady tab first
        await switchAdminTab(page, 'naklady');
        await expect(page.locator('#expenses-section')).toBeVisible();

        // Set cash
        const cashInput = page.locator('#cash-total');
        await cashInput.fill('10000');
        await cashInput.dispatchEvent('change');
        await page.waitForTimeout(500);

        // Verify remaining cash
        await expect(page.locator('#cash-remaining')).toContainText('10');

        // Add expense
        await page.locator('#expense-name').fill('Notárske poplatky');
        await page.locator('#expense-value').fill('3000');
        await page.locator('#expense-add-btn').click();
        await page.waitForTimeout(600);

        // Verify expense appears in list
        await expect(page.locator('#expense-list')).toContainText('Notárske poplatky', { timeout: 5000 });

        // Verify remaining cash decreased: 10000 - 3000 = 7000
        await expect(page.locator('#cash-remaining')).toContainText('7');
    });

    test('should add items, set cash and set allocations', async ({ page }) => {
        // Add items
        await addItem(page, 'Dom', 100000);
        await addItem(page, 'Auto', 20000);

        // Set cash (needed for participant limit calculations)
        const cashInput = page.locator('#cash-total');
        await cashInput.fill('30000');
        await cashInput.dispatchEvent('change');
        await page.waitForTimeout(500);

        // Set Zuzka = 50% — dispatch native change event (bubbles to delegated handler)
        await page.evaluate(() => {
            const domRow = Array.from(document.querySelectorAll('.item-row'))
                .find(row => row.textContent.includes('Dom'));
            if (!domRow) return;
            const input = domRow.querySelector('.alloc-input');
            if (!input) return;
            input.value = '50';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(800);

        // Set Dana = 25% — fresh DOM query (renderAll() rebuilt the DOM after first change)
        await page.evaluate(() => {
            const domRow = Array.from(document.querySelectorAll('.item-row'))
                .find(row => row.textContent.includes('Dom'));
            if (!domRow) return;
            const inputs = domRow.querySelectorAll('.alloc-input');
            if (inputs.length < 2) return;
            inputs[1].value = '25';
            inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(800);

        // Verify Zuzka's used value: 50% of Dom = 50000
        await expect(page.locator('#used-0')).toContainText('50', { timeout: 5000 });
        await expect(page.locator('#used-1')).toContainText('25', { timeout: 5000 });
    });

    test('should rename participant', async ({ page }) => {
        // Click on Zuzka's name to edit
        const nameEl = page.locator('#participant-name-0');
        await nameEl.click();
        await page.waitForTimeout(300);

        // Input should replace the name heading
        const nameInput = page.locator('.participant-name-input');
        await expect(nameInput).toBeVisible({ timeout: 3000 });
        await nameInput.fill('ZUZKA');
        await nameInput.press('Enter');
        await page.waitForTimeout(500);

        // Name should be updated
        await expect(page.locator('#participant-name-0')).toHaveText('ZUZKA');
    });

    test('should switch between tabs', async ({ page }) => {
        // Click on "Náklady" tab
        await switchAdminTab(page, 'naklady');
        await expect(page.locator('#expenses-section')).toBeVisible();

        // Click on "Správa PIN" tab
        await switchAdminTab(page, 'pins');
        await expect(page.locator('#pins-grid')).toBeVisible({ timeout: 3000 });

        // Should show 5 rows (admin + 4 heirs)
        const pinRows = page.locator('.pin-row');
        await expect(pinRows).toHaveCount(5);

        // Switch back to Majetok
        await switchAdminTab(page, 'majetok');
        await expect(page.locator('#add-item-section')).toBeVisible();
    });

    test('should sort and filter items', async ({ page }) => {
        // Add items
        await addItem(page, 'Auto', 20000, 'Doprava');
        await addItem(page, 'Dom', 100000, 'Nehnuteľnosť');

        // Sort by value ascending
        await page.locator('#sort-select').selectOption('value');
        await page.waitForTimeout(500);

        // First item should be Auto (20k)
        const firstItem = page.locator('.item-row').first().locator('.item-name');
        await expect(firstItem).toContainText('Auto');

        // Toggle sort direction
        await page.locator('#sort-dir-btn').click();
        await page.waitForTimeout(500);

        // First item should now be Dom (100k)
        await expect(page.locator('.item-row').first().locator('.item-name')).toContainText('Dom');

        // Filter by 'Nehnuteľnosť'
        await page.locator('#filter-category').selectOption('Nehnuteľnosť');
        await page.waitForTimeout(500);

        await expect(page.locator('#items-list')).toContainText('Dom');
        await expect(page.locator('#items-list')).not.toContainText('Auto');

        // Reset filter to show all
        await page.locator('#filter-category').selectOption('all');
        await page.waitForTimeout(500);
        await expect(page.locator('#items-list')).toContainText('Auto');
    });

    test('should delete an item', async ({ page }) => {
        await addItem(page, 'Dom', 100000);
        await addItem(page, 'Auto', 20000);

        // Delete Dom
        const domItem = page.locator('.item-row').filter({ hasText: 'Dom' });
        await domItem.locator('[data-action="delete"]').click();
        await page.waitForTimeout(400);

        // Confirm modal should appear
        await expect(page.locator('#confirm-modal.open')).toBeVisible({ timeout: 3000 });
        await page.locator('#modal-confirm-btn').click();
        await page.waitForTimeout(600);

        // Dom should be removed
        await expect(page.locator('#items-list')).not.toContainText('Dom');
        await expect(page.locator('#items-count-display')).toHaveText('1', { timeout: 3000 });
    });

    test('should export and import data', async ({ page }) => {
        // Add items
        await addItem(page, 'Dom', 100000, 'Nehnuteľnosť');
        await addItem(page, 'Auto', 20000, 'Doprava');
        await expect(page.locator('#items-count-display')).toHaveText('2', { timeout: 3000 });

        // Trigger export and wait for download
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 8000 }),
            page.locator('#export-btn').click(),
        ]);
        expect(download).not.toBeNull();

        // Read exported JSON
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const exportedData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        expect(exportedData.items.length).toBe(2);
        expect(exportedData.items[0].name).toBe('Dom');

        // Reset all data
        await page.locator('#reset-btn').click();
        await page.waitForTimeout(400);
        await expect(page.locator('#confirm-modal.open')).toBeVisible({ timeout: 3000 });
        await page.locator('#modal-confirm-btn').click();
        await page.waitForTimeout(800);

        // Items should be gone — system cash items remain (Hotovosť + na pokrytie = 2)
        await expect(page.locator('#items-count-display')).toHaveText('2', { timeout: 3000 });

        // Import the data back
        await page.locator('#import-input').setInputFiles({
            name: 'export.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(exportedData)),
        });
        await page.waitForTimeout(1000);

        // Items should be restored (2 user items + 2 system cash items = 4)
        await expect(page.locator('#items-count-display')).toHaveText('4', { timeout: 5000 });
        await expect(page.locator('#items-list')).toContainText('Dom');
        await expect(page.locator('#items-list')).toContainText('Auto');
    });

    test('should reset all data', async ({ page }) => {
        await addItem(page, 'Dom', 100000);
        await expect(page.locator('#items-count-display')).toHaveText('1', { timeout: 3000 });

        // Click reset
        await page.locator('#reset-btn').click();
        await page.waitForTimeout(400);

        // Confirm modal
        await expect(page.locator('#confirm-modal.open')).toBeVisible({ timeout: 3000 });
        await page.locator('#modal-confirm-btn').click();
        await page.waitForTimeout(800);

        // All items should be gone — system cash items remain (Hotovosť + na pokrytie = 2)
        await expect(page.locator('#items-count-display')).toHaveText('2', { timeout: 3000 });
        await expect(page.locator('#items-list')).not.toContainText('Dom');
        await expect(page.locator('#items-list')).toContainText('Hotovosť');
    });
});

// ============================================================
// 3. Forgot PIN
// ============================================================
test.describe('Forgot PIN', () => {

    test('should clear all PINs via forgot PIN and show setup again', async ({ page }) => {
        await setupAdmin(page);

        // Logout
        await page.locator('#header-logout-btn').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#login-overlay')).toBeVisible();

        // Click "Zabudli ste PIN?"
        await page.locator('#forgot-pin-btn').click();
        await page.waitForTimeout(400);

        // Confirm modal
        await expect(page.locator('#confirm-modal.open')).toBeVisible({ timeout: 3000 });
        await page.locator('#modal-confirm-btn').click();
        await page.waitForTimeout(800);

        // Setup overlay should show again (only on first run, so PINs were cleared)
        await expect(page.locator('#setup-overlay')).toBeVisible({ timeout: 5000 });
    });
});

// ============================================================
// 4. Heir Permissions
// ============================================================
test.describe('Heir Permissions', () => {

    test('heir can see items but limited UI', async ({ page }) => {
        await setupAdmin(page, HEIR1_PIN);

        // Add items as admin
        await addItem(page, 'Dom', 100000);
        await addItem(page, 'Auto', 20000);
        await expect(page.locator('#items-count-display')).toHaveText('2', { timeout: 3000 });

        // Logout
        await page.locator('#header-logout-btn').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#login-overlay')).toBeVisible();

        // Login as Zuzka (heir 0)
        await page.locator('#login-pin').fill(HEIR1_PIN);
        await page.locator('#login-form').getByRole('button', { name: 'Prihlásiť' }).click();
        await page.waitForTimeout(800);

        // Heir sees items
        await expect(page.locator('#items-list')).toContainText('Dom');
        await expect(page.locator('#items-list')).toContainText('Auto');

        // Heir doesn't see admin controls
        await expect(page.locator('#add-item-section')).not.toBeVisible();
        await expect(page.locator('#admin-nav')).not.toBeVisible();
        await expect(page.locator('#heir-nav')).toBeVisible();

        // Zuzka's alloc inputs should be enabled (own allocations)
        const domItem = page.locator('.item-row').filter({ hasText: 'Dom' });
        const zuzkaInput = domItem.locator('.alloc-input').nth(0);
        await expect(zuzkaInput).not.toBeDisabled();
    });
});

// ============================================================
// 5. Edge Cases
// ============================================================
test.describe('Edge Cases', () => {

    test('should show empty state when no items', async ({ page }) => {
        await setupAdmin(page);
        const emptyState = page.locator('.items-empty');
        await expect(emptyState).toBeVisible();
        await expect(emptyState).toContainText('Zatiaľ nebol pridaný žiadny majetok');
    });

    test('should persist data after page reload', async ({ page }) => {
        await setupAdmin(page);

        // Add item
        await addItem(page, 'Dom', 100000, 'Nehnuteľnosť');
        await expect(page.locator('#items-count-display')).toHaveText('1', { timeout: 3000 });

        // Reload page — data should persist in localStorage
        await page.reload();
        await page.waitForTimeout(1000);

        // Should auto-login (remember me) and item should persist
        await expect(page.locator('#header-user-badge')).toContainText('Administrátor', { timeout: 5000 });
        await expect(page.locator('#items-count-display')).toHaveText('1', { timeout: 5000 });
        await expect(page.locator('#items-list')).toContainText('Dom');
    });
});

// ============================================================
// 6. Print
// ============================================================
test.describe('Print', () => {

    test('print button triggers window.print', async ({ page }) => {
        await setupAdmin(page);

        // Intercept window.print
        let printCalled = false;
        await page.exposeFunction('__printIntercept', () => {
            printCalled = true;
        });
        await page.evaluate(() => {
            window.print = window.__printIntercept;
        });

        await page.locator('#print-btn').click();
        await page.waitForTimeout(500);

        expect(printCalled).toBe(true);
    });
});

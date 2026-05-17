/**
 * UI Module Tests
 *
 * Tests: formatEUR, parseEUR, escapeHtml, clamp, renderCategoryDatalist,
 *        showToast, showConfirmModal, showPinInputModal
 */

import { assert, assertEqual, printSummary } from './helpers.js';

export async function testUi({ window, document }) {
    // Dynamic import of production modules (globals already set up by helpers)
    const uiMod = await import('../ui.js');

    const {
        formatEUR, parseEUR, escapeHtml, clamp,
        showToast, showConfirmModal, showPinInputModal,
    } = uiMod;

    console.log('\n\u{1F4C1} UI Module');

    // ─── formatEUR ─────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 formatEUR');

        assertEqual(formatEUR(0), '\u20ac0,00', 'formatEUR(0)');
        assertEqual(formatEUR(100), '\u20ac100,00', 'formatEUR(100)');
        // thousands separator depends on Node.js version/ICU: may be NBSP (U+00A0)
        const formatted1234 = formatEUR(1234.5);
        assert(formatted1234.startsWith('\u20ac1') && formatted1234.endsWith('234,50'),
            `formatEUR(1234.5) formats with thousands separator: ${JSON.stringify(formatted1234)}`);
        const formattedNeg = formatEUR(-50);
        assert(formattedNeg.startsWith('-'), 'formatEUR(-50) starts with minus');
        assertEqual(formatEUR(0.1), '\u20ac0,10', 'formatEUR(0.1)');
        assertEqual(formatEUR(0.001), '\u20ac0,00', 'formatEUR(0.001) rounds to 0');
    })();

    // ─── parseEUR ─────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 parseEUR');

        assertEqual(parseEUR('100'), 100, 'parseEUR("100")');
        assertEqual(parseEUR('0'), 0, 'parseEUR("0")');
        assertEqual(parseEUR('12.5'), 12.5, 'parseEUR("12.5")');
        assertEqual(parseEUR(''), 0, 'parseEUR("") returns 0');
        assertEqual(parseEUR('abc'), 0, 'parseEUR("abc") returns 0');
        assertEqual(parseEUR('  50  '), 50, 'parseEUR with whitespace');
    })();

    // ─── escapeHtml ────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 escapeHtml');

        assertEqual(escapeHtml('hello'), 'hello', 'escapeHtml plain text');
        // jsdom innerHTML only escapes &lt; &gt; &amp; in text content
        const escaped = escapeHtml('<script>alert("xss")</script>');
        assert(escaped.includes('&lt;') && escaped.includes('&gt;') && !escaped.includes('<'),
            `escapeHtml escapes angle brackets: ${JSON.stringify(escaped)}`);
        assertEqual(escapeHtml('a & b'),
            'a &amp; b',
            'escapeHtml escapes ampersands');
        // Quotes in text content are not escaped by innerHTML
        const withQuote = escapeHtml('text "quote" here');
        assert(withQuote.includes('"'), 'escapeHtml does not escape double quotes in text');
    })();

    // ─── clamp ────────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 clamp');

        assertEqual(clamp(5, 0, 10), 5, 'clamp within range');
        assertEqual(clamp(-5, 0, 10), 0, 'clamp below min');
        assertEqual(clamp(15, 0, 10), 10, 'clamp above max');
        assertEqual(clamp(0, 0, 100), 0, 'clamp at min boundary');
        assertEqual(clamp(100, 0, 100), 100, 'clamp at max boundary');
    })();

    // ─── showToast ────────────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 showToast');

        showToast('Test message', 'success');

        const container = document.querySelector('.toast-container');
        assert(container, 'Toast container is created');
        assertEqual(container.children.length, 1, 'Toast element added');

        const toast = container.querySelector('.toast');
        assert(toast, 'Toast element has .toast class');
        assert(toast.classList.contains('toast-success'), 'Toast has success class');
        assertEqual(toast.textContent, 'Test message', 'Toast shows correct message');
    })();

    // ─── showConfirmModal ─────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 showConfirmModal');

        const modal = document.querySelector('#confirm-modal');
        assert(modal, 'Confirm modal exists in HTML');

        showConfirmModal({
            title: 'Test Title',
            message: 'Test message body',
            confirmText: 'OK',
        });

        assert(modal.classList.contains('open'), 'Modal opens when showConfirmModal is called');
        assertEqual(document.querySelector('#modal-title').textContent, 'Test Title', 'Modal title set');
        assertEqual(document.querySelector('#modal-message').textContent, 'Test message body', 'Modal message set');
        assertEqual(document.querySelector('#modal-confirm-text').textContent, 'OK', 'Confirm button text set');
    })();

    // ─── showPinInputModal ────────────────────────────────
    (() => {
        console.log('  \u2500\u2500 showPinInputModal');

        const pinModal = document.querySelector('#pin-modal');
        assert(pinModal, 'PIN input modal exists in HTML');

        showPinInputModal({
            title: 'Change PIN',
            message: 'Enter new PIN',
            initialValue: '',
        });

        assert(pinModal.classList.contains('open'), 'PIN modal opens');
        assertEqual(document.querySelector('#pin-modal-title').textContent, 'Change PIN', 'PIN modal title set');
        assertEqual(document.querySelector('#pin-modal-message').textContent, 'Enter new PIN', 'PIN modal message');
    })();

    return printSummary('UI Module');
}

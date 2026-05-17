/**
 * Test helpers: jsdom setup, assertion functions
 *
 * IMPORTANT: setupJsdom() must be called BEFORE importing production modules,
 * because they reference document, localStorage, crypto etc. as globals.
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Set up jsdom environment with full index.html and mock browser globals.
 * Call this once, before dynamically importing production modules.
 */
export function setupJsdom() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const htmlPath = join(__dirname, '..', 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    const dom = new JSDOM(html, {
        url: 'http://127.0.0.1:8080/',
        pretendToBeVisual: true,
        runScripts: 'outside-only',
        storageQuota: 10000000,
    });

    // Set up browser globals so imported modules can find them
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.Blob = dom.window.Blob;
    globalThis.URL = dom.window.URL;
    // Force production modules to skip Supabase in unit tests.
    globalThis.__DISABLE_SUPABASE__ = true;
    // navigator, console, and some others are read-only in Node.js — skip them;

    // Mock crypto.subtle.digest for Node.js (crypto.subtle is a read-only getter)
    if (!globalThis.crypto) {
        globalThis.crypto = {};
    }
    Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: {
            digest: async (algorithm, data) => {
                const { createHash } = await import('node:crypto');
                return createHash('sha256').update(data).digest();
            },
        },
    });

    return { window: dom.window, document: dom.window.document };
}

// ==============================
// Assertion helpers
// ==============================

function _increment(condition) {
    totalTests++;
    if (!condition) failedTests++;
    return condition;
}

export function assert(condition, msg = 'Assertion failed') {
    _increment(condition);
    if (!condition) {
        console.log(`  \u2717 ${msg}`);
    }
}
assert.ok = assert;
assert.fail = function fail(msg = 'Assertion failed') {
    totalTests++;
    failedTests++;
    console.log(`  \u2717 ${msg}`);
};

export function assertEqual(actual, expected, msg) {
    const ok = Object.is(actual, expected);
    _increment(ok);
    if (!ok) {
        console.log(`  \u2717 ${msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
    }
}

export function assertClose(actual, expected, tolerance = 0.01, msg) {
    const ok = Math.abs(actual - expected) <= tolerance;
    _increment(ok);
    if (!ok) {
        console.log(`  \u2717 ${msg || `Expected ${expected} \u00b1 ${tolerance}, got ${actual}`}`);
    }
}

export function assertArrayEqual(actual, expected, msg) {
    let ok = true;
    if (actual.length !== expected.length) {
        ok = false;
    } else {
        for (let i = 0; i < actual.length; i++) {
            if (!Object.is(actual[i], expected[i])) {
                ok = false;
                break;
            }
        }
    }
    _increment(ok);
    if (!ok) {
        console.log(`  \u2717 ${msg || `Array lengths differ: ${actual.length} vs ${expected.length}`}`);
    }
}

let totalTests = 0;
let failedTests = 0;

export function test(name, fn) {
    totalTests++;
    try {
        fn();
    } catch (e) {
        failedTests++;
        console.log(`  ${e.message}`);
    }
}

export function printSummary(label) {
    const passed = totalTests - failedTests;
    const color = failedTests > 0 ? '\x1b[31m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(`${color}${label}: ${passed}/${totalTests} passed${failedTests > 0 ? `, ${failedTests} failed` : ''}${reset}`);

    const result = { passed, total: totalTests, failed: failedTests };
    totalTests = 0;
    failedTests = 0;
    return result;
}

/**
 * Create a fresh DOM state by clearing localStorage and resetting the auth overlay.
 */
export function resetEnvironment({ window, document }) {
    window.localStorage.clear();
    // Reset auth overlays for the next test suite
    const setupOverlay = document.querySelector('#setup-overlay');
    const loginOverlay = document.querySelector('#login-overlay');
    if (setupOverlay) {
        setupOverlay.style.display = 'none';
        setupOverlay.setAttribute('aria-hidden', 'true');
    }
    if (loginOverlay) {
        loginOverlay.style.display = 'none';
        loginOverlay.setAttribute('aria-hidden', 'true');
    }
}

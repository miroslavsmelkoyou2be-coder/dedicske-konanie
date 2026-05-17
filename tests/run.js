/**
 * Dedi\u010dsk\u00e9 konanie \u2013 Test Runner (ES Modules)
 *
 * Usage: node tests/run.js [suite]
 *   - omitted: run all suites
 *   - "auth": auth module
 *   - "state": state module
 *   - "ui": UI helpers
 *   - "app": app module (actions, sorting, reset)
 */

import { setupJsdom, resetEnvironment } from './helpers.js';

const suite = process.argv[2];

async function main() {
    console.log('='.repeat(60));
    console.log('\u{1F9EA} Dedi\u010dsk\u00e9 konanie \u2013 Unit Tests');
    console.log('='.repeat(60));

    // Set up jsdom FIRST so globals are available when production modules are imported
    const { window, document } = setupJsdom();

    let failed = 0;

    if (!suite || suite === 'auth') {
        const { testAuth } = await import('./auth.test.js');
        const result = await testAuth({ window, document });
        if (result && result.failed > 0) failed++;
    }

    if (!suite || suite === 'state') {
        resetEnvironment({ window, document });
        const { testState } = await import('./state.test.js');
        const result = await testState({ window, document });
        if (result && result.failed > 0) failed++;
    }

    if (!suite || suite === 'ui') {
        resetEnvironment({ window, document });
        const { testUi } = await import('./ui.test.js');
        const result = await testUi({ window, document });
        if (result && result.failed > 0) failed++;
    }

    if (!suite || suite === 'app') {
        resetEnvironment({ window, document });
        const { testApp } = await import('./app.test.js');
        const result = await testApp({ window, document });
        if (result && result.failed > 0) failed++;
    }

    console.log('\n' + '='.repeat(60));
    if (failed > 0) {
        console.log(`\u274C ${failed} test suite(s) failed!`);
        process.exit(1);
    } else {
        console.log('\u2705 All test suites passed!');
    }
}

main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});

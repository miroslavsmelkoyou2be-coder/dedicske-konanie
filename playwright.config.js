import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    retries: 0,
    use: {
        baseURL: 'http://127.0.0.1:8080',
        headless: true,
        viewport: { width: 1280, height: 900 },
        locale: 'sk-SK',
        ignoreHTTPSErrors: true,
    },
    webServer: {
        command: 'cd .. && python3 -m http.server 8080 --bind 127.0.0.1',
        port: 8080,
        cwd: '.',
        reuseExistingServer: true,
    },
});

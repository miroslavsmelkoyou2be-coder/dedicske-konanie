# Dedičské konanie — Rozdelenie majetku

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/miroslavsmelkoyou2be-coder/dedicske-konanie&root-directory=dedicske-konanie)

Aplikácia na pomoc pri dedičskom konaní. Umožňuje spravovať majetok, alokovať ho medzi štyroch účastníkov (Zuzka 1/2, Dana 1/6, Katka 1/6, Miro 1/6), evidovať náklady a hotovosť, a sledovať limity každého účastníka.

**Vanilla JS SPA** — bez frameworkov, všetko beží natívne v prehliadači. Dáta sa ukladajú do `localStorage`.

---

## 🚀 Rýchly štart

```bash
# Spustenie lokálneho servera
cd dedicske-konanie
python3 -m http.server 8080 --bind 127.0.0.1

# Otvor v prehliadači:
# http://127.0.0.1:8080/
```

Pri prvom spustení sa zobrazí nastavenie PIN-ov. Nastavte administrátorský PIN (max 6 číslic) a voliteľne PIN-y pre dedičov.

---

## 🧪 Testovanie

Testy bežia v Node.js s `jsdom` a testujú reálne produkčné funkcie (žiadne mocky).

```bash
cd dedicske-konanie

# Inštalácia závislostí
npm install

# Spustenie všetkých testov
npm test

# Alebo jednotlivé moduly
npm run test:auth
npm run test:state
npm run test:ui
npm run test:app
```

### Výsledky (183 testov)

| Modul | Testov | Čo testuje |
|-------|--------|------------|
| **Auth** | 41 | `hashPin` (SHA-256), login/logout, permisie (`isAdmin`, `canEditItems`, `canEditAllocations`), migrácia starých plain-text PIN-ov |
| **State** | 70 | Konštanty, `createDefaultState`, business logika (`getTotalValue`, `getAssignedValue`, `getParticipantLimit`), `syncCashItem`, persistencia |
| **UI** | 35 | `formatEUR`, `parseEUR`, `escapeHtml`, `clamp`, toasty (`showToast`), modály (`showConfirmModal`, `showPinInputModal`) |
| **App** | 37 | `addItem`, `deleteItem`, `updateItemValue`, `setAllocation`, `updateParticipantName`, `getSortedItems`, reset |

---

## 📁 Štruktúra projektu

```
dedicske-konanie/
├── index.html          (613)   ← Hlavná stránka — HTML štruktúra
├── styles.css         (2486)   ← Všetky štýly (dark/light mode, print, animácie, responzivita)
│
├── auth.js            (180)    ← Autentifikácia
├── state.js           (423)    ← Dátový model & business logika
├── ui.js              (893)    ← DOM helpery, rendrovanie, modály, toasty
├── expenses.js         (84)    ← Cash a náklady handlery
├── app.js             (770)    ← Event handlery, akcie, init()
│
├── package.json        (15)    ← Node.js závislosti
├── package-lock.json  (516)
│
└── tests/                      ← Unit testy (jsdom)
    ├── helpers.js      (141)   ← Test setup
    ├── run.js           (55)   ← Test runner
    ├── auth.test.js    (153)   ← 41 testov
    ├── state.test.js   (228)   ← 70 testov
    ├── ui.test.js      (131)   ← 35 testov
    └── app.test.js     (174)   ← 37 testov
```

**Celkom: ~6 800 riadkov**

---

## 🧱 Architektúra

### Moduly

| Modul | Účel | Kľúčové funkcie |
|-------|------|-----------------|
| **auth.js** | Autentifikácia a autorizácia | `hashPin()` (SHA-256), `login()`, `logout()`, session timeout (15 min), migrácia plain-text PIN-ov, permisie (`isAdmin`, `isHeir`, `canEditItems`, `canEditAllocations`) |
| **state.js** | Dátový model a perzistencia | `state` objekt, `saveState()` / `loadState()` / `clearSavedState()`, localStorage persistence, business logika (`getTotalValue`, `getAssignedValue`, `getParticipantLimit`), `syncCashItem()`, export/import JSON |
| **ui.js** | Rendering a DOM helpery | Všetky render funkcie (`renderItems`, `renderParticipants`, `renderSummary`), modály (`showConfirmModal`, `showPinInputModal`), toasty (`showToast`), helpery (`formatEUR`, `escapeHtml`, `clamp`), tab switching, kategórie a filter |
| **expenses.js** | Náklady | `handleCashChange`, `handleAddExpense`, `handleDeleteExpense` |
| **app.js** | Orchestrácia a eventy | Event handlery (`handleAddItem`, `handleAllocationChange`, `handleLogin`, `handleSetup`), akcie (`addItem`, `setAllocation`, `deleteItem`), `init()`, sorting |

### Tok inicializácie

1. `auth.js` a `state.js` deklarujú globálne `auth` a `state` objekty
2. `init()` v `app.js`:
   - `loadAuth()` — načíta PIN-y z localStorage
   - `await migrateAuthToHashed()` — prehashuje staré plain-text PIN-y
   - `loadState()` — načíta majetok, alokácie, náklady z localStorage
   - Bindne eventy, aplikuje farby, zavolá `renderAuthUI()`
3. Podľa stavu autentifikácie sa zobrazí:
   - **Setup overlay** (prvý krát — PIN nie je nastavený)
   - **Login overlay** (PIN je nastavený, používateľ nie je prihlásený)
   - **Aplikácia** (používateľ je prihlásený)

### Dáta

Všetky dáta sa ukladajú do `localStorage` v prehliadači. Žiadny server, žiadna databáza.

#### `dedicskeKonanie` (verzia 3)

```json
{
  "items": [
    { "id": 1, "name": "Rodinný dom", "value": 100000,
      "category": "Nehnuteľnosť", "allocations": [] }
  ],
  "nextItemId": 2,
  "categories": ["Nehnuteľnosť", "Doprava"],
  "participantNames": ["Zuzka", "Dana", "Katka", "Miro"],
  "participantColors": ["#6366f1", "#f59e0b", "#10b981", "#ec4899"],
  "cash": 5000,
  "expenses": [
    { "id": 1, "name": "Pohreb", "participantId": 0, "value": 3000 }
  ],
  "nextExpenseId": 2
}
```

#### `dedicskeKonanieAuth` (verzia 2)

```json
{
  "adminPin": "9af15b336e6a9619...",
  "heirPins": ["", "hash...", "", ""],
  "currentUser": { "role": "admin" },
  "authVersion": 2
}
```

> PIN-y sú hashované SHA-256 — nedajú sa spätne získať. Pri strate PIN-u použite tlačidlo **"Zabudnutý PIN?"** na prihlasovacej obrazovke.

---

## 🔐 Bezpečnosť

- **PIN-y:** SHA-256 hashované, nikdy neukladané ako plain-text
- **Session timeout:** Automatické odhlásenie po 15 minútach nečinnosti
- **Remember-me:** Voliteľné — ak je vypnuté, po zatvorení prehliadača sa používateľ odhlási
- **Migrácia:** Staré plain-text PIN-y (z predchádzajúcej verzie) sa automaticky prehashujú pri štarte
- **Roly:** Rozlíšenie medzi administrátorom (plný prístup) a dedičmi (len vlastné alokácie a náklady)

---

## 👤 Roly a permisie

| Akcia | Admin | Dedič (svoj index) | Dedič (iný index) | Neprihlásený |
|-------|-------|--------------------|--------------------|--------------|
| Pridať/zmazať položku | ✅ | ❌ | ❌ | ❌ |
| Upraviť hodnotu položky | ✅ | ❌ | ❌ | ❌ |
| Alokovať majetok (sebe) | ✅ | ✅ | ❌ | ❌ |
| Meniť meno účastníka (sebe) | ✅ | ✅ | ❌ | ❌ |
| Spravovať PIN-y | ✅ | ❌ | ❌ | ❌ |
| Pridať náklad | ✅ | ❌ | ❌ | ❌ |
| Vidieť prehľad | ✅ | ✅ | Iba majetok | ❌ |

---

## 🖨 Tlač / PDF

Aplikácia podporuje tlač cez prehliadač (Ctrl+P alebo tlačidlo v UI). Pri tlači sa automaticky skryjú interaktívne prvky (tlačidlá, inputy) a zobrazí sa len prehľadný výstup vhodný na PDF.

---

## 🎨 Štýly

- **Dark/Light režim** — automaticky podľa systémového nastavenia (`prefers-color-scheme`)
- **Responzívny dizajn** — funguje na mobile aj desktop
- **Prístupnosť** — `prefers-reduced-motion` vypína animácie, `:focus-visible` pre klávesovú navigáciu
- **Tlač** — optimalizovaný print stylesheet
- **Farebné schémy účastníkov** — každý účastník má vlastnú farbu, ktorú je možné meniť

---

## 🛠 Technológie

| Technológlia | Účel |
|-------------|------|
| HTML5 | Štruktúra |
| CSS3 (2 486 riadkov) | Štýly, dark/light režim, print, animácie |
| Vanilla JavaScript (2 350 riadkov) | Logika aplikácie |
| localStorage | Perzistencia dát |
| SHA-256 (Web Crypto API) | Hashovanie PIN-ov |
| Node.js + jsdom | Testovanie |

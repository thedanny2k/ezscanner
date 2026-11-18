# src/ui

The screens. Each file draws from `app` in `../state.js` and calls the tested modules for logic.

| File | Screen |
| --- | --- |
| `render.js` | The bucket: card list, totals, review bar, calculator fields |
| `sheets.js` | Bottom sheets: Change (fix a card), Search to add, Buckets list, CSV import |
| `settings.js` | Settings: AI key and model, double-check mode, price source, accuracy table |
| `dom.js` | Helpers: element lookup, money formatting, toast, in-page ask dialog |

Camera wiring and the calculator's event handlers live in `../main.js`.

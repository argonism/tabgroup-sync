<p align="center">
  <img src="icons/icon128.png" alt="Tab Group Sync" width="128" height="128">
</p>

# Tab Group Sync

A Chrome extension that synchronizes tab groups (name, color, tabs, order, collapsed state) across multiple browser windows within the same profile.

[**Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/tab-group-sync/aglfoddkogoahnkjjipjmoglcjmlbeoc)

## Features

- Keep tab groups consistent across all windows in the same Chrome profile
- Three sync modes:
  - **Automatic** — sync all tab groups
  - **Whitelist** — sync only the groups you list
  - **Blacklist** — exclude listed groups from syncing
- Fine-grained control over which properties to sync: name, color, collapsed state, tab content (URLs), and tab order
- Match groups by name, color, or both
- Automatic snapshots of tab group states with manual restore after a browser restart
- Manual "Sync now" action from the options page
- Available in English and Japanese

## Installation

### From source

```bash
npm install
npm run build
```

Then load the project directory as an unpacked extension from `chrome://extensions` (Developer mode → Load unpacked).

### Chrome Web Store

Install directly from the [Chrome Web Store listing](https://chromewebstore.google.com/detail/tab-group-sync/aglfoddkogoahnkjjipjmoglcjmlbeoc).

## Development

```bash
npm run watch       # rebuild on change
npm run typecheck   # TypeScript type check
npm run test        # run tests (vitest)
npm run test:run    # run tests once
```

## Project structure

```
src/
  background/   Service worker: sync engine, listeners, state, snapshots
  options/      Options UI (settings, sync status, saved states)
  shared/       Shared utilities (i18n)
  privacy/      Privacy policy page
_locales/       en, ja translations
icons/          Extension icons
```

## Permissions

- `tabGroups`, `tabs` — read and modify tab groups and tabs
- `storage` — persist settings and snapshots locally

No data is sent to external servers. See `docs/privacy.html` for the full privacy policy.

## License

See repository for license details.

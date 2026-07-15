# Tauri desktop build

Helvetic Freight can be started as a desktop app through Tauri without changing the existing HTML/CSS/JavaScript game files.

## Requirements

- Node.js 20 or newer
- Rust toolchain with Cargo
- Python 3 for the local development web server used by the helper script
- Tauri system dependencies for the target platform

## First setup

Install JavaScript dependencies once:

```bash
npm install
```

## Start the desktop app for development

Start everything with one command from the repository root:

```bash
npm run dev
```

The `dev` script starts a local static file server on `127.0.0.1:1420`, waits until `Helvetic_Freight_v1.1.38_CleanApp.html` is reachable, and then opens the Tauri desktop window.

## Optional manual startup

If you want to run the static server yourself, use:

```bash
npm run serve
```

Then start Tauri in a second terminal with:

```bash
npm run tauri -- dev
```

## Production build

Create native desktop bundles:

```bash
npm run build
```

Build artifacts are written under `src-tauri/target/release/bundle/`.

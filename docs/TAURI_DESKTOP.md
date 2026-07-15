# Tauri desktop build

Helvetic Freight can be started as a desktop app through Tauri without changing the existing HTML/CSS/JavaScript game files.

## Requirements

- Node.js 20 or newer
- Rust toolchain with Cargo
- Tauri system dependencies for the target platform

## Development

Install JavaScript dependencies once:

```bash
npm install
```

Start the desktop app in development mode:

```bash
npm run dev
```

The Tauri window opens `Helvetic_Freight_v1.1.38_CleanApp.html` directly from the repository root.

## Production build

Create native desktop bundles:

```bash
npm run build
```

Build artifacts are written under `src-tauri/target/release/bundle/`.

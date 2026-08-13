import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig(() => {
  const devBackendPort = process.env.DEV_BACKEND_PORT ?? '3001';
  const devBackend = `http://127.0.0.1:${devBackendPort}`;
  const webOnly = process.env.VITE_WEB_ONLY === 'true';

  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      ...(webOnly
        ? []
        : [
            electron({
              main: {
                entry: 'electron-app/main.ts',
              },
              preload: {
                input: 'electron-app/preload.ts',
              },
              renderer: {},
            }),
            renderer(),
          ]),
      {
        name: 'log-dev-proxy',
        configureServer(server) {
          server.httpServer?.once('listening', () => {
            const addr = server.httpServer?.address();
            const port =
              typeof addr === 'object' && addr && 'port' in addr
                ? addr.port
                : '?';
            console.log(
              `[vite] Dev UI on port ${port} — proxy /api /health /socket.io → ${devBackend}`,
            );
          });
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // recharts is intentionally NOT forced into its own vendor chunk:
            // it's only ever reached through AdminDashboard's React.lazy()
            // boundary (report charts), but a forced manualChunks entry made
            // Rollup treat it as an entry-level dependency anyway, so every
            // window — including the lightweight shooter/picker bootstrap
            // screens that never render a chart — eagerly modulepreloaded
            // all 384KB of it. Leaving it to automatic chunking keeps it
            // scoped to the async boundary that actually needs it.
            'vendor-motion': ['motion'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, './src/types/shared'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/api': { target: devBackend, changeOrigin: true },
        '/health': { target: devBackend, changeOrigin: true },
        // The NestJS gateway is mounted on socket.io's DEFAULT path. Without
        // this entry the Vite dev server answers the handshake itself and
        // engine.io reports "server error", then reconnects forever.
        // `ws: true` is required — the upgrade is a WebSocket, not plain HTTP.
        '/socket.io': { target: devBackend, ws: true, changeOrigin: true },
      },
    },
  };
});

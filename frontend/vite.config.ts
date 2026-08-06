import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';
  const openaiKey = isProd
    ? ''
    : env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.OPENAI_API_KEY': JSON.stringify(openaiKey),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(openaiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      // Mahalliy: /api → FastAPI (docker 8100 yoki VITE_API_PROXY_TARGET).
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8100',
          changeOrigin: true,
        },
        '/media': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8100',
          changeOrigin: true,
        },
      },
      // With --host 0.0.0.0, pin HMR to localhost so the browser ws:// URL matches dev machine access.
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {
              host: 'localhost',
              port: 3000,
              protocol: 'ws',
            },
    },
  };
});

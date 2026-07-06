// vite.config.production.js - Production-optimized Vite configuration
import { defineConfig } from 'vite'
import { compression } from 'vite-plugin-compression'
import { imagetools } from 'vite-plugin-imagetools'
import { bundleAnalyzer } from 'vite-bundle-analyzer'
import { resolve } from 'path'

export default defineConfig({
  base: '/app/',
  publicDir: 'public',
  plugins: [
    // Gzip compression for static assets
    compression({
      verbose: true,
      disable: false,
      threshold: 1024, // Compress assets larger than 1KB
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli compression (optional)
    compression({
      verbose: true,
      disable: false,
      threshold: 1024,
      algorithm: 'brotli',
      ext: '.br',
    }),
    // Image optimization
    imagetools({
      include: ['**/*.{png,jpg,jpeg,webp,svg,ico,tiff,gif,avif}'],
      options: {
        limit: 0, // No limit for production
        quality: 85,
      },
    }),
    // Bundle analyzer for production (optional)
    process.env.ANALYZE === 'true' && bundleAnalyzer(),
  ].filter(Boolean),
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Enable source maps for production debugging
    sourcemap: true,
    // Minify output
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
    // Rolling chunks for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks for better caching
          if (id.includes('node_modules')) {
            const packageName = id.split('node_modules/')[1].split('/')[0];
            return `vendor-${packageName}`;
          }
          // Component chunks
          if (id.includes('/src/components/')) {
            const pathParts = id.split('/src/components/')[1].split('/');
            return `components-${pathParts[0]}`;
          }
          // Core application logic
          if (id.includes('/src/')) {
            const pathParts = id.split('/src/')[1].split('/');
            if (pathParts.length > 1 && !pathParts[0].includes('.')) {
              return `app-${pathParts[0]}`;
            }
          }
          // Return empty string for original modules
          return null;
        },
        // Optimize chunk size and naming
        chunkSizeLimit: 500 * 1024, // 500KB
        entryFileNames: 'js/[name].[hash].js',
        chunkFileNames: 'js/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        // Add custom properties for better cache busting
        manualChunks: {
          'vue-vendor': ['vue', 'vuex', 'vue-router', 'vuex-router-sync'],
          'ui-vendor': ['@mui/material', '@emotion/react', '@emotion/styled'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'ai-vendor': ['@google/generative-ai', ' sharp'],
        },
      },
    },
    // Enable CSS code splitting
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      extractor: {
        // Custom extractor for better CSS splitting
        extractCritical: false,
      },
      // CSS code splitting
      codeSplit: true,
    },
    // Enable module preloading hints
    modulePreload: {
      // Preload critical dependencies
      dependencies: ['src/main'],
      // Exclude dynamic imports from preloading
      exclude: [//src/pages/.*\.js$/],
    },
    // Target modern browsers
    target: 'ES2022',
    // Polyfills for modern features
    polyfillModulePreload: true,
    // Clean output directory before build
    emptyOutDir: true,
    // Enable production optimizations
    generateRollupPlugins() {
      return [];
    },
  },
  // Development server configuration (for production preview)
  server: {
    port: 3000,
    strictPort: true,
    // Enable CORS for production
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    // Proxy API calls to backend during development
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewritePath: (path) => path.replace(/^\/api/, ''),
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
        },
      },
      '/auth': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewritePath: (path) => path.replace(/^\/auth/, ''),
        secure: false,
      },
      '/subjects': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewritePath: (path) => path.replace(/^\/subjects/, ''),
        secure: false,
      },
    },
    // Hot module replacement
    hmr: {
      overlay: true,
    },
  },
  // Environment variable handling
  define: {
    __VITE_APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __VITE_APP_MODE__: JSON.stringify(process.env.NODE_ENV || 'production'),
    __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL || '/api'),
    __VITE_BACKEND_URL__: JSON.stringify(process.env.VITE_BACKEND_URL || 'http://localhost:8000'),
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['vue', 'vuex', 'vue-router', 'axios'],
    exclude: ['@google/generative-ai'],
    // Include dependencies for faster initial load
    force: true,
  },
  // Custom resolve configurations
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@stores': resolve(__dirname, 'src/stores'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@api': resolve(__dirname, 'src/api'),
      '@assets': resolve(__dirname, 'src/assets'),
    },
    // Maintain same package.json exports
    dedupe: ['vue', 'vuex'],
  },
  // Logging configuration
  logLevel: process.env.LOG_LEVEL || 'info',
  clearScreen: false,
  // Performance measurements
  measure: process.env.MEASURE === 'true',
  // Custom banner for production builds
  customBanner: `
\n=== AttendWise Production Build ===
Build Time: ${new Date().toISOString()}
Assets Optimized: gzipped + brotli
Bundle Size: Analyze with 'npm run build:analyze'
Source Maps: Enabled
===================================================\n\n`,
});
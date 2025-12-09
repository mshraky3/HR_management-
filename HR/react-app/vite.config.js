import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Ensure base path is correct for Vercel
  server: {
    port: 5173,
  },
  build: {
    // Optimize chunk splitting for better code splitting
    rollupOptions: {
      // Performance Optimization: Enhanced tree shaking
      treeshake: {
        moduleSideEffects: false, // Assume no side effects for better tree shaking
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
      output: {
        // Manual chunks for better caching and code splitting
        manualChunks: (id) => {
          // Separate vendor chunks for better caching
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('axios')) {
              return 'axios-vendor';
            }
            // Other vendor libraries
            return 'vendor';
          }
        },
        // Optimize chunk file names for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit (we're using code splitting, so chunks will be smaller)
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional, can disable for smaller builds)
    sourcemap: false,
    // CSS code splitting - split CSS per page but keep critical CSS in main bundle
    cssCodeSplit: true,
    // Ensure CSS is loaded synchronously
    cssMinify: true,
    // Performance Optimization: Remove console.log in production using esbuild
    esbuild: {
      drop: ['console', 'debugger'], // Remove console and debugger in production
      legalComments: 'none', // Remove comments for smaller bundle
    },
    // Target modern browsers for better optimization
    target: 'es2015',
  },
  // Optimize CSS loading
  css: {
    devSourcemap: false,
    // Ensure CSS is processed and loaded efficiently
    postcss: undefined, // Use default PostCSS config
  },
})

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fills in the public site URL (SITE_URL) for canonical / Open Graph tags and
// generates sitemap.xml + robots.txt, so nothing points at a temporary preview host.
const siteUrlPlugin = (siteUrl) => ({
  name: 'snai3i-site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
  generateBundle() {
    const lastmod = new Date().toISOString().slice(0, 10);
    const sitemap = siteUrl
      ? `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
      : null;
    const robots = [
      'User-agent: *',
      'Allow: /',
      '',
      '# Authenticated application areas have no SEO value',
      'Disallow: /dashboard/',
      'Disallow: /student/',
      'Disallow: /admin-panel/',
      'Disallow: /admin/',
      'Disallow: /api/',
      'Disallow: /uploads/',
      '',
      ...(siteUrl ? [`Sitemap: ${siteUrl}/sitemap.xml`] : []),
      '',
    ].join('\n');

    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    if (sitemap) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (process.env.SITE_URL || env.SITE_URL || '').trim().replace(/\/+$/, '');

  return {
    plugins: [react(), tailwindcss(), siteUrlPlugin(siteUrl)],
    build: { chunkSizeWarningLimit: 700 }, // three.js is lazy-loaded on the first coin celebration
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8001', changeOrigin: true },
        '/uploads': { target: 'http://127.0.0.1:8001', changeOrigin: true },
        '/admin': { target: 'http://127.0.0.1:8001', changeOrigin: true },
        '/static': { target: 'http://127.0.0.1:8001', changeOrigin: true },
      },
    },
  };
});

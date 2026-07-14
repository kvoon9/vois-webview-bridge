import { defineConfig } from 'blume'

export default defineConfig({
  title: 'WebView Bridge',
  description:
    'Typed bridge for invoking native functionality from web pages in Vois / Weila applications',

  // Content lives in the docs/ folder (bilingual: root = English, zh/ = Chinese)
  content: {
    root: 'docs',
  },

  // GitHub integration for "Edit on GitHub" and repo link
  github: {
    owner: 'vois',
    repo: 'webview-bridge',
    branch: 'main',
  },

  // i18n matching the existing VitePress setup (English default, Chinese under /zh)
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', label: 'English' },
      { code: 'zh', label: '简体中文' },
    ],
  },

  // Theming — close to the previous blue-ish accent
  theme: {
    accent: '#0a66c2',
  },

  // AI features are on by default (llms.txt, Copy as Markdown, etc.)
  ai: {
    llmsTxt: true,
  },

  // SEO + sitemap (deployment.site is auto-detected on Cloudflare Pages)
  seo: {
    og: { enabled: true },
    sitemap: true,
    robots: true,
    structuredData: true,
  },

  // Deployment configuration
  deployment: {
    // We will handle moving the output to docs/dist via the package script
    // so the root dist/ (library) is not overwritten.
  },

  // Last updated from git
  lastModified: true,

  // Keep table of contents on by default (H2-H3)
  toc: {
    minHeadingLevel: 2,
    maxHeadingLevel: 3,
  },
})

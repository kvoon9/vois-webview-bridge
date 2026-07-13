import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/vois.ts'],
    dts: {
      tsgo: true,
    },
    exports: {
      customExports(pkgExports) {
        for (const key of ['.', './vois']) {
          const entry = pkgExports[key]
          if (typeof entry === 'string') {
            pkgExports[key] = {
              types: entry.replace(/\.mjs$/, '.d.mts'),
              import: entry,
              default: entry,
            }
          }
        }
        return pkgExports
      },
    },
  },

  test: {
    environment: 'happy-dom',
  },

  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },

  fmt: {
    semi: false,
    singleQuote: true,
    sortImports: true,
    jsxSingleQuote: true,
    sortPackageJson: true,
  },

  staged: {
    '*.{js,ts,tsx,vue,svelte}': 'vp check --fix',
    'package.json': 'vp check --fix',
  },
})

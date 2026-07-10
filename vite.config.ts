import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: {
      customExports(pkgExports) {
        const root = pkgExports['.']
        if (typeof root === 'string') {
          pkgExports['.'] = {
            types: './dist/index.d.mts',
            import: root,
            default: root,
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

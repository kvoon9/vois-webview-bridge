import { defineMeta } from 'blume'

export default defineMeta({
  // Control ordering of top-level items (index, folders, and loose pages).
  // Lower order comes first. We recreate the previous logical groups via ordering.
  pages: [
    // Introduction section (index + data-spec)
    'index',
    'data-spec',

    // Usage section
    'web-usage',
    'native', // the native/ folder will expand to its children

    // Protocols, API, FAQ
    'protocols/built-in',
    'api',
    'faq',
  ],
})

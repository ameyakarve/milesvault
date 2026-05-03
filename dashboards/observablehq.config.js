// Observable Framework config for the MilesVault dashboards bundle.
//
// Output goes to ../public/dashboards/ so the Next app serves it as static
// assets at /dashboards/<slug>/. Each .md page becomes one dashboard and
// fetches per-user data at runtime from /api/ledger/* (same origin, so the
// next-auth session cookie carries through automatically).

export default {
  root: 'src',
  output: '../public/dashboards',
  // Next serves files from `public/` verbatim with no extension stripping, so
  // we keep the .html suffix on URLs.
  cleanUrls: false,
  // Render dashboards as standalone pages — they're embedded as iframes inside
  // the per-account view, so the Framework chrome (sidebar, toc, search, header,
  // footer) would be redundant.
  sidebar: false,
  toc: false,
  search: false,
  header: '',
  footer: '',
  pager: false,
  title: 'MilesVault dashboards',
}

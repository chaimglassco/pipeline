# Library and Pipeline consolidation

The Pipeline repository builds both applications in a single Next.js deployment.
Library source was imported from `chaimglassco/ppc-dashboard` commit
`2153133eddf38b8982cee799bd5b4af74d370101`, onto Pipeline commit
`74a31f6222eb2defa72b4098f76c670956213f2d`.
The existing Library/PPC application retains its `/ppc` base path, source, content,
storage keys and API implementations. Pipeline HTML, JavaScript and CSS remain
unchanged at the repository root; the build copies only runtime assets into
`public`. Vercel routes `/`, `/index.html`, `/js/*` and `/css/*` to those assets.
Repository recovery bundles, credentials and source files are not public assets.

The original CommonJS Pipeline handlers remain in `api` and keep their database,
authentication and permission logic. Thin Pages API exports expose them inside
the Next build; Vercel maps the original `/api/*` URLs to these handlers. Image
uploads retain raw request streaming. No database migration or browser-storage
reset is required. Audit uploads remain local to the browser.

## Deployment prerequisites and cutover

- Use the existing Pipeline Vercel project and `glasscopipeline.vercel.app`.
- Connect the existing Library Blob store `store_kxj9NcfpnsP1oQjO` to Pipeline;
  do not create an empty replacement or copy user datasets.
- Preserve Pipeline's production database/auth/storage environment settings and
  `LIBRARY_BACKUP_SECRET`; configure `CRON_SECRET` for the daily maintenance job.
- Build and verify the migration branch before switching the production commit.
- Verify Pipeline login, workspace reads, Library reads, PPC shared data, Audit,
  product assets and API rejection of unauthenticated requests.
- Keep the old Library project available for rollback until cutover is verified.
  Do not delete the Blob store when retiring that project.

## Checks

Run `npm run check`, `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`. The build includes `check-unified-deployment.cjs`. Inspect the
Vercel deployment routes as well: root aliases are platform rewrites and are not
provided by standalone `next start`. Local PPC is at `/ppc/dashboard`, Library
at `/ppc/library`, and the Pipeline asset at `/ppc/pipeline.html`.

## Compatibility and verification

App and Pages routes coexist, so navigation hooks may return null. Library shell, catalog and reader use safe route/search defaults. Existing domain/UI implementations are otherwise preserved. Tests are scoped to src so repository recovery directories are excluded from discovery.

The migration preview is https://pipeline-kwmbpovnz-chaim-6608s-projects.vercel.app (commit e30d0f3). Pipeline root assets and the /api/auth/login alias render correctly there; the /ppc/api/dashboard/state route rejects requests without a session. Local checks confirm raw upload authorization, API rejection and asset delivery. Existing Pipeline user data was observed before cutover: 20 products total, 7 in Product Research.

Final local validation: 90 test files passed; 517 tests passed and 6 skipped. ESLint, TypeScript, Pipeline contract checks and the production build passed. The Node API wrappers retain raw image uploads and allow JSON request bodies up to 4.5 MB. Production verification must confirm the same 20 Pipeline products, 2 Library documents and 33 PPC portfolio products.

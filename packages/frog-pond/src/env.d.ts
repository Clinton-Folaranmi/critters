// Set by the builds (scripts/build.mjs, scripts/build-standalone.mjs):
// true keeps the dev-only helpers (frame stepping, forced fallback, the
// __frog* console hooks); every shipped build has false, and the minifier
// drops that code.
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}

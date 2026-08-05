# T3 Code standalone Linear plugin

This is an independently installable Linear work-source plugin. It is a
reference implementation of issue authentication, project mapping, issue CRUD,
and provider-neutral work-item presentation. Bob does not depend on this
plugin; Bob owns its own Bob-to-Linear relationship when that integration is
enabled.

The source classification for the existing Linear work is tracked in
`custom-local/docs/plugins/migration-manifest.yaml` in the T3 checkout.

The proof-of-concept RPC boundary in `src/rpc.ts` keeps project discovery and
issue mutations Linear-owned while returning normalized work items to T3.

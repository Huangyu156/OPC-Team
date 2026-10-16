# Rebuilding relay-server static assets

`src/apps/relay-server/static/` is a build artifact of `src/mobile-web`
(the Remote Connect relay serves the mobile web client from this directory).

Rebuild after changing mobile-web:

```bash
pnpm --filter opc-mobile-web build
# then copy the dist output:
rm -rf src/apps/relay-server/static/*
cp -r src/mobile-web/dist/* src/apps/relay-server/static/
```

The directory is committed so the relay binary can be deployed without a Node
toolchain on the server.

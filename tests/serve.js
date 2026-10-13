// Serves the page with wrangler's own server, the way Cloudflare serves it, for the browser checks.
// Not `wrangler dev`: it reloads whenever a file in the folder it serves changes, and it writes its
// own state into that folder, so it never settles. Its programmatic start can stop watching.
import { fileURLToPath } from "node:url";
import { unstable_startWorker } from "wrangler";

const worker = await unstable_startWorker({
  config: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
  dev: {
    watch: false,
    inspector: false,
    server: { hostname: "127.0.0.1", port: Number(process.env.PORT ?? 8788) },
  },
});
await worker.ready;
console.log(`Serving QR at ${await worker.url}`);

const stop = async () => {
  await worker.dispose();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

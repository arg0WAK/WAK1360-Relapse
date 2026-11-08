import { build } from "esbuild";

await build({
  entryPoints: ["js/helper.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/js/chain.js",
});

const ts = new Date().toLocaleString();
console.log(`[${ts}] BUILD OK -> dist/js/chain.js`);

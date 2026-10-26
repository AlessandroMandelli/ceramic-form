import { build } from "esbuild";
await build({
  entryPoints: ["js/app.js"],
  outfile: "app.bundle.js",
  bundle: true,
  format: "iife",
  target: ["chrome90", "edge90", "firefox100", "safari15.4"],
  legalComments: "inline",
});

import * as esbuild from "esbuild";
import { cpSync, mkdirSync, writeFileSync, readFileSync } from "fs";

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: {
    "background": "src/background/index.ts",
    "options": "src/options/options.ts",
  },
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome120",
};

function copyStatic() {
  mkdirSync("dist/icons", { recursive: true });

  // Generate dist manifest with corrected paths (bundled, no module needed)
  const manifest = JSON.parse(readFileSync("manifest.json", "utf-8"));
  manifest.background = { service_worker: "background.js" };
  manifest.options_ui = { page: "options.html", open_in_tab: true };
  writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));

  cpSync("icons", "dist/icons", { recursive: true });
  cpSync("_locales", "dist/_locales", { recursive: true });
  cpSync("src/options/options.html", "dist/options.html");
  cpSync("src/privacy/privacy.html", "dist/privacy.html");

  console.log("[build] Static files copied");
}

async function main() {
  copyStatic();

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("[build] Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    console.log("[build] Done");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

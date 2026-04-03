import * as esbuild from "esbuild";
import { cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, createWriteStream } from "fs";
import { join, relative } from "path";
import { createDeflateRaw } from "zlib";

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

const IGNORE = new Set([".DS_Store", "Thumbs.db"]);

function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({ path: relative(base, full), full });
    }
  }
  return files;
}

function deflate(buf) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const deflater = createDeflateRaw();
    deflater.on("data", (c) => chunks.push(c));
    deflater.on("end", () => resolve(Buffer.concat(chunks)));
    deflater.on("error", reject);
    deflater.end(buf);
  });
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createZip(dir, outPath) {
  const files = collectFiles(dir);
  const entries = [];

  for (const { path, full } of files) {
    const raw = readFileSync(full);
    const compressed = await deflate(raw);
    entries.push({
      name: Buffer.from(path),
      raw,
      compressed,
      crc: crc32(raw),
    });
  }

  const stream = createWriteStream(outPath);
  let offset = 0;
  const centralHeaders = [];

  for (const e of entries) {
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed
    localHeader.writeUInt16LE(0, 6);           // flags
    localHeader.writeUInt16LE(8, 8);           // compression: deflate
    localHeader.writeUInt16LE(0, 10);          // mod time
    localHeader.writeUInt16LE(0, 12);          // mod date
    localHeader.writeUInt32LE(e.crc, 14);
    localHeader.writeUInt32LE(e.compressed.length, 18);
    localHeader.writeUInt32LE(e.raw.length, 22);
    localHeader.writeUInt16LE(e.name.length, 26);
    localHeader.writeUInt16LE(0, 28);          // extra length

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(e.crc, 16);
    centralHeader.writeUInt32LE(e.compressed.length, 20);
    centralHeader.writeUInt32LE(e.raw.length, 24);
    centralHeader.writeUInt16LE(e.name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralHeaders.push({ header: centralHeader, name: e.name });

    stream.write(localHeader);
    stream.write(e.name);
    stream.write(e.compressed);
    offset += localHeader.length + e.name.length + e.compressed.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const { header, name } of centralHeaders) {
    stream.write(header);
    stream.write(name);
    centralSize += header.length + name.length;
  }

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);
  stream.write(endRecord);

  await new Promise((resolve) => stream.end(resolve));
  console.log(`[build] Created ${outPath} (${entries.length} files)`);
}

async function main() {
  copyStatic();

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("[build] Watching for changes...");
  } else {
    await esbuild.build(buildOptions);
    await createZip("dist", "extension.zip");
    console.log("[build] Done");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    if (key === "merge") {
      args.merge = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function readNotes(args) {
  if (args["notes-file"]) {
    return readFileSync(path.resolve(args["notes-file"]), "utf8").trim();
  }
  return (args.notes || "").trim();
}

function resolveUrl(args, artifactPath) {
  if (args.url) {
    return args.url;
  }
  if (!args["base-url"]) {
    fail("Provide either --url or --base-url");
  }
  const base = args["base-url"].replace(/\/$/, "");
  return `${base}/${path.basename(artifactPath)}`;
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      fail(`Unsupported URL protocol in ${url}`);
    }
  } catch (error) {
    fail(`Invalid URL '${url}': ${error.message}`);
  }
}

const args = parseArgs(process.argv.slice(2));

const version = (args.version || "").trim();
if (!version) {
  fail("--version is required");
}

const target = (args.target || "").trim();
if (!target) {
  fail("--target is required (example: linux-x86_64)");
}

const artifactPath = path.resolve(args.artifact || "");
if (!args.artifact) {
  fail("--artifact is required");
}
if (!existsSync(artifactPath)) {
  fail(`Artifact not found: ${artifactPath}`);
}

const signaturePath = path.resolve(args.signature || `${artifactPath}.sig`);
if (!existsSync(signaturePath)) {
  fail(`Signature not found: ${signaturePath}`);
}

const signature = readFileSync(signaturePath, "utf8").trim();
if (!signature) {
  fail(`Signature file is empty: ${signaturePath}`);
}

const url = resolveUrl(args, artifactPath);
validateUrl(url);

const outputPath = path.resolve(args.output || "updater/latest.json");
let manifest = {
  version,
  notes: "",
  pub_date: new Date().toISOString(),
  platforms: {},
};

if (args.merge && existsSync(outputPath)) {
  const existingRaw = readFileSync(outputPath, "utf8");
  const existing = JSON.parse(existingRaw);
  if (
    typeof existing === "object" &&
    existing &&
    typeof existing.platforms === "object"
  ) {
    manifest = {
      version: version || existing.version,
      notes: existing.notes || "",
      pub_date: existing.pub_date || manifest.pub_date,
      platforms: { ...existing.platforms },
    };
  }
}

manifest.version = version;
const notes = readNotes(args);
if (notes) {
  manifest.notes = notes;
}
manifest.pub_date = args["pub-date"] || new Date().toISOString();
manifest.platforms[target] = {
  signature,
  url,
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(outputPath, json, "utf8");

console.log(`Wrote manifest: ${outputPath}`);
console.log(`Target: ${target}`);
console.log(`Version: ${manifest.version}`);
console.log(`URL: ${url}`);

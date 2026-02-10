#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
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
    if (key === "skip-artifact") {
      args.skipArtifact = true;
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

function defaultTarget() {
  const platform = os.platform();
  const arch = os.arch();

  const platformMap = {
    linux: "linux",
    win32: "windows",
    darwin: "darwin",
  };
  const archMap = {
    x64: "x86_64",
    arm64: "aarch64",
    arm: "armv7",
  };

  const mappedPlatform = platformMap[platform];
  const mappedArch = archMap[arch];
  if (!mappedPlatform || !mappedArch) {
    fail(
      `Unsupported host platform/arch for default target: ${platform}/${arch}`,
    );
  }
  return `${mappedPlatform}-${mappedArch}`;
}

async function readManifest(manifestArg) {
  if (manifestArg.startsWith("http://") || manifestArg.startsWith("https://")) {
    const response = await fetch(manifestArg);
    if (!response.ok) {
      fail(`Failed to fetch manifest (${response.status}): ${manifestArg}`);
    }
    return response.text();
  }

  const manifestPath = path.resolve(manifestArg);
  if (!existsSync(manifestPath)) {
    fail(`Manifest not found: ${manifestPath}`);
  }
  return readFileSync(manifestPath, "utf8");
}

async function checkArtifact(url) {
  let response = await fetch(url, { method: "HEAD" });
  if (response.ok) {
    return;
  }

  response = await fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  });

  if (!response.ok) {
    fail(`Artifact URL is not reachable (${response.status}): ${url}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const manifestArg = (args.manifest || "").trim();
if (!manifestArg) {
  fail("--manifest is required (path or URL)");
}

const target = (args.target || defaultTarget()).trim();
const raw = await readManifest(manifestArg);

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (error) {
  fail(`Manifest is not valid JSON: ${error.message}`);
}

if (!manifest || typeof manifest !== "object") {
  fail("Manifest root must be an object");
}

if (typeof manifest.version !== "string" || !manifest.version.trim()) {
  fail("Manifest is missing non-empty 'version'");
}

if (!manifest.platforms || typeof manifest.platforms !== "object") {
  fail("Manifest is missing 'platforms' object");
}

const platformEntry = manifest.platforms[target];
if (!platformEntry || typeof platformEntry !== "object") {
  fail(`Manifest has no entry for target '${target}'`);
}

if (
  typeof platformEntry.signature !== "string" ||
  !platformEntry.signature.trim()
) {
  fail(`Target '${target}' is missing non-empty signature`);
}

if (typeof platformEntry.url !== "string" || !platformEntry.url.trim()) {
  fail(`Target '${target}' is missing non-empty url`);
}

let parsedUrl;
try {
  parsedUrl = new URL(platformEntry.url);
} catch (error) {
  fail(`Invalid artifact URL for '${target}': ${error.message}`);
}
if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
  fail(`Unsupported protocol for artifact URL: ${platformEntry.url}`);
}

if (!args.skipArtifact) {
  await checkArtifact(platformEntry.url);
}

console.log(`Manifest OK`);
console.log(`Version: ${manifest.version}`);
console.log(`Target: ${target}`);
console.log(`Artifact URL: ${platformEntry.url}`);
console.log(`Signature length: ${platformEntry.signature.length}`);

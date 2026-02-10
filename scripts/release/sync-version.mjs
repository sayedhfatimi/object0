#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

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
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function normalizeVersion(input) {
  const raw = input.trim();
  const version = raw.startsWith("v") ? raw.slice(1) : raw;
  const semverLike = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
  if (!semverLike.test(version)) {
    fail(`Invalid version '${input}'`);
  }
  return version;
}

function updateJsonVersion(filePath, version) {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  parsed.version = version;
  writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function updateCargoVersion(filePath, version) {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.replace(/\r?\n$/, "").split(/\r?\n/);

  let inPackageSection = false;
  let updated = false;
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inPackageSection = trimmed === "[package]";
      return line;
    }

    if (inPackageSection && /^version\s*=/.test(trimmed)) {
      updated = true;
      const indent = line.match(/^\s*/)?.[0] || "";
      return `${indent}version = "${version}"`;
    }

    return line;
  });

  if (!updated) {
    fail(`Could not find [package] version in ${filePath}`);
  }

  const nextRaw = nextLines.join("\n");
  writeFileSync(filePath, `${nextRaw}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
const input = args.version || process.env.RELEASE_VERSION;
if (!input) {
  fail("Provide --version or RELEASE_VERSION");
}

const version = normalizeVersion(input);
const root = process.cwd();

const packageJsonPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");

updateJsonVersion(packageJsonPath, version);
updateJsonVersion(tauriConfigPath, version);
updateCargoVersion(cargoTomlPath, version);

console.log(`Synchronized app version to ${version}`);

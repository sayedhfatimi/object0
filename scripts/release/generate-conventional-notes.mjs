#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch (error) {
    fail(`Git command failed: git ${args.join(" ")}\n${error.message}`);
  }
}

function normalizeTag(tag) {
  const value = (tag || "").trim();
  if (!value) {
    fail("Missing tag");
  }
  if (!/^v\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(value)) {
    fail(`Invalid tag '${value}'`);
  }
  return value;
}

function parseConventionalHeader(header) {
  const match =
    /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s(?<subject>.+)$/.exec(
      header,
    );
  if (!match?.groups) {
    return null;
  }
  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope || null,
    subject: match.groups.subject.trim(),
    breaking: Boolean(match.groups.breaking),
  };
}

function fmtEntry({ scope, subject, hash }) {
  if (scope) {
    return `- **${scope}:** ${subject} (${hash.slice(0, 7)})`;
  }
  return `- ${subject} (${hash.slice(0, 7)})`;
}

function section(title, entries) {
  if (entries.length === 0) {
    return "";
  }
  return `### ${title}\n${entries.join("\n")}\n\n`;
}

function buildMarkdown(tag, previousTag, commits) {
  const breaking = [];
  const features = [];
  const fixes = [];
  const performance = [];
  const refactors = [];
  const docs = [];
  const chores = [];
  const other = [];

  for (const commit of commits) {
    const parsed = parseConventionalHeader(commit.subject);
    const isBreaking =
      Boolean(parsed?.breaking) || /(^|\n)BREAKING CHANGE:/i.test(commit.body);

    const normalized = {
      scope: parsed?.scope || null,
      subject: parsed?.subject || commit.subject,
      hash: commit.hash,
    };

    if (isBreaking) {
      breaking.push(fmtEntry(normalized));
    }

    if (!parsed) {
      if (!commit.subject.startsWith("Merge ")) {
        other.push(fmtEntry(normalized));
      }
      continue;
    }

    switch (parsed.type) {
      case "feat":
        features.push(fmtEntry(normalized));
        break;
      case "fix":
        fixes.push(fmtEntry(normalized));
        break;
      case "perf":
        performance.push(fmtEntry(normalized));
        break;
      case "refactor":
        refactors.push(fmtEntry(normalized));
        break;
      case "docs":
        docs.push(fmtEntry(normalized));
        break;
      case "build":
      case "chore":
      case "ci":
      case "style":
      case "test":
        chores.push(fmtEntry(normalized));
        break;
      default:
        other.push(fmtEntry(normalized));
        break;
    }
  }

  const range = previousTag ? `${previousTag}..${tag}` : `start..${tag}`;
  let markdown = `## Changelog\n\n`;
  markdown += `Range: \`${range}\`\n\n`;
  markdown += section("Breaking Changes", breaking);
  markdown += section("Features", features);
  markdown += section("Fixes", fixes);
  markdown += section("Performance", performance);
  markdown += section("Refactors", refactors);
  markdown += section("Documentation", docs);
  markdown += section("Chores", chores);
  markdown += section("Other Changes", other);

  if (
    breaking.length +
      features.length +
      fixes.length +
      performance.length +
      refactors.length +
      docs.length +
      chores.length +
      other.length ===
    0
  ) {
    markdown += "No user-facing changes found in this range.\n";
  }

  return markdown;
}

const args = parseArgs(process.argv.slice(2));
const currentTag = normalizeTag(args["current-tag"]);
const previousTag = args["previous-tag"]
  ? normalizeTag(args["previous-tag"])
  : "";
const outputPath = path.resolve(args.output || "RELEASE_NOTES.md");

const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
const raw = git(["log", range, "--format=%H%x1f%s%x1f%b%x1e", "--no-merges"]);

const commits = raw
  .split("\x1e")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((record) => {
    const [hash, subject, body] = record.split("\x1f");
    return {
      hash: (hash || "").trim(),
      subject: (subject || "").trim(),
      body: (body || "").trim(),
    };
  })
  .filter((commit) => commit.hash && commit.subject);

const markdown = buildMarkdown(currentTag, previousTag || null, commits);
writeFileSync(outputPath, `${markdown.trim()}\n`, "utf8");
console.log(`Wrote ${outputPath}`);

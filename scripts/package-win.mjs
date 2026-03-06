import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const electronBuilderCommand = path.join(repoRoot, "node_modules", ".bin", "electron-builder.cmd");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

const getWinCodeSignCacheDir = () => {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) return null;
  const cacheDir = path.join(localAppData, "electron-builder", "Cache", "winCodeSign");
  return existsSync(cacheDir) ? cacheDir : null;
};

const resolveWinCodeSignBundle = () => {
  const cacheDir = getWinCodeSignCacheDir();
  if (!cacheDir) return null;

  const candidates = readdirSync(cacheDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(cacheDir, entry.name))
    .filter((entryPath) =>
      existsSync(path.join(entryPath, "rcedit-x64.exe")) &&
      existsSync(path.join(entryPath, "windows-10", "x64", "signtool.exe"))
    )
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return candidates[0] ?? null;
};

const run = (args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(electronBuilderCommand, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
      env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`electron-builder exited with code ${code ?? 1}`));
    });
  });

const runRcedit = (rceditPath, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(rceditPath, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`rcedit exited with code ${code ?? 1}`));
    });
  });

const normalizeWindowsVersion = (version) => {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 4) {
    parts.push(0);
  }
  return parts.slice(0, 4).join(".");
};

const quoteYamlString = (value) => JSON.stringify(value);

const serializeYamlValue = (value, indent = "") => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => `${indent}- ${serializeYamlValue(entry, `${indent}  `).trimStart()}`)
      .join("\n");
  }

  if (typeof value === "string") {
    return quoteYamlString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value == null) {
    return "null";
  }

  throw new Error(`Unsupported YAML value: ${value}`);
};

const writeAppUpdateConfig = (resourcesDir) => {
  const publishConfig = packageJson.build?.publish?.[0];
  if (!publishConfig || typeof publishConfig !== "object") {
    throw new Error("Missing build.publish[0] config for auto-updates.");
  }

  const updaterConfig = {
    ...publishConfig,
    updaterCacheDirName: `${String(packageJson.name ?? "app").toLowerCase()}-updater`
  };
  const yamlLines = Object.entries(updaterConfig).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}:\n${serializeYamlValue(value, "  ")}`;
    }
    return `${key}: ${serializeYamlValue(value)}`;
  });
  const configPath = path.join(resourcesDir, "app-update.yml");
  writeFileSync(configPath, `${yamlLines.join("\n")}\n`, "utf8");

  if (!existsSync(configPath)) {
    throw new Error(`Updater config was not created: ${configPath}`);
  }
};

const productName = packageJson.build?.productName ?? packageJson.productName ?? packageJson.name;
const companyName =
  typeof packageJson.author === "string"
    ? packageJson.author
    : packageJson.author?.name ?? productName;
const version = normalizeWindowsVersion(packageJson.version ?? "0.0.0");
const iconPath = path.join(repoRoot, "build", "icon.ico");
const appOutDir = path.join(repoRoot, "release", "win-unpacked");
const resourcesDir = path.join(appOutDir, "resources");
const exePath = path.join(appOutDir, `${productName}.exe`);
const userArgs = process.argv.slice(2);
const shouldOnlyBuildDir = userArgs.includes("--dir");
const targetArgs = shouldOnlyBuildDir ? ["--dir"] : userArgs;

if (!existsSync(iconPath)) {
  console.error(`Icon not found: ${iconPath}`);
  process.exit(1);
}

const winCodeSignBundlePath = resolveWinCodeSignBundle();
if (!winCodeSignBundlePath) {
  console.error("Could not find cached Windows packaging tools. Run packaging once with signAndEdit disabled or install the tools manually.");
  process.exit(1);
}

const rceditPath = path.join(winCodeSignBundlePath, "rcedit-x64.exe");

await run([
  "--dir",
  "-c.win.signAndEditExecutable=false"
]);

if (!existsSync(exePath)) {
  console.error(`Packaged executable not found: ${exePath}`);
  process.exit(1);
}

await runRcedit(rceditPath, [
  exePath,
  "--set-icon",
  iconPath,
  "--set-version-string",
  "FileDescription",
  productName,
  "--set-version-string",
  "ProductName",
  productName,
  "--set-version-string",
  "CompanyName",
  companyName,
  "--set-version-string",
  "InternalName",
  productName,
  "--set-version-string",
  "OriginalFilename",
  `${productName}.exe`,
  "--set-file-version",
  version,
  "--set-product-version",
  version
]);

writeAppUpdateConfig(resourcesDir);

if (shouldOnlyBuildDir) {
  process.exit(0);
}

await run([
  "--prepackaged",
  appOutDir,
  ...targetArgs,
  "-c.win.signAndEditExecutable=false"
]);

if (!existsSync(path.join(resourcesDir, "app-update.yml"))) {
  console.error(`Updater config missing after packaging: ${path.join(resourcesDir, "app-update.yml")}`);
  process.exit(1);
}

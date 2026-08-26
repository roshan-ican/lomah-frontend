// Downloads the three binaries face_inference.rs expects at runtime:
//
//   onnxruntime.dll                    CPU-only ONNX Runtime (Microsoft release)
//   face_detection_yunet.onnx          YuNet detector      (OpenCV Zoo)
//   face_recognition_sface_int8.onnx   SFace recogniser    (OpenCV Zoo)
//
// They land in lomah-core/runtime/, which is gitignored: ~24 MB of binaries
// does not belong in the repository, and electron-builder copies the directory
// into the installer as extraResources instead.
//
// Runs as part of `npm run electron:build`, so it must be cheap to repeat:
// anything already installed with the right checksum is left alone.
//
// The DLL must match the C API the crate is pinned to. Cargo.toml requests
// ort's "api-23" feature, and that number IS the ONNX Runtime minor version:
// ort refuses to load a DLL older than the API it was built against. Change
// ONNXRUNTIME_VERSION and that feature together, or neither.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const RUNTIME_DIR = path.join(CORE_DIR, "runtime");
const CACHE_DIR = path.join(CORE_DIR, "target", "face-runtime-cache");

const ONNXRUNTIME_VERSION = "1.23.0";
const ZOO_COMMIT = "main";

/** Expected SHA-256 of each installed file. A null entry downloads and prints
 *  the hash rather than failing, so adding a file is a deliberate two-step:
 *  fetch once, then paste the hash back in here to pin it. */
const CHECKSUMS = {
  "onnxruntime.dll":
    "b4b7f9aed3cf6b04000f595bddcbdf12e87214bc401d1b81beadae3dbf28d2bd",
  "face_detection_yunet.onnx":
    "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  "face_recognition_sface_int8.onnx":
    "2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a",
};

const MODELS = [
  {
    name: "face_detection_yunet.onnx",
    url: `https://github.com/opencv/opencv_zoo/raw/${ZOO_COMMIT}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
  },
  {
    name: "face_recognition_sface_int8.onnx",
    url: `https://github.com/opencv/opencv_zoo/raw/${ZOO_COMMIT}/models/face_recognition_sface/face_recognition_sface_2021dec_int8.onnx`,
  },
];

const RUNTIME_ARCHIVE = {
  name: `onnxruntime-win-x64-${ONNXRUNTIME_VERSION}.zip`,
  url: `https://github.com/microsoft/onnxruntime/releases/download/v${ONNXRUNTIME_VERSION}/onnxruntime-win-x64-${ONNXRUNTIME_VERSION}.zip`,
  /** Path of the DLL inside the archive, always forward-slashed. */
  member: `onnxruntime-win-x64-${ONNXRUNTIME_VERSION}/lib/onnxruntime.dll`,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function download(url, destination) {
  process.stdout.write(`  fetching ${url}\n`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
  return bytes;
}

/** Reports the hash rather than throwing when no expected value is recorded
 *  yet; refuses the file outright when one is recorded and does not match. */
function verify(name, bytes) {
  const actual = sha256(bytes);
  const expected = CHECKSUMS[name];
  if (!expected) {
    process.stdout.write(
      `  ${name}: ${(bytes.length / 1024).toFixed(0)} KB, sha256 ${actual}\n` +
        `    (no checksum recorded — paste this into CHECKSUMS to pin it)\n`,
    );
    return;
  }
  if (actual !== expected) {
    throw new Error(
      `${name} does not match the recorded checksum.\n` +
        `  expected ${expected}\n  actual   ${actual}\n` +
        `Refusing to install a binary that is not the one this build was verified against.`,
    );
  }
  process.stdout.write(`  ${name}: checksum ok\n`);
}

/** True when the file is already installed AND matches its pinned checksum.
 *  Skipping on mere existence would keep a truncated or tampered file forever;
 *  re-downloading 24 MB on every build is not acceptable either. */
async function alreadyInstalled(name) {
  if (!CHECKSUMS[name]) return false;
  try {
    const bytes = await fs.readFile(path.join(RUNTIME_DIR, name));
    return sha256(bytes) === CHECKSUMS[name];
  } catch {
    return false;
  }
}

/** The extractor, resolved explicitly rather than off PATH.
 *
 *  Two different programs answer to `tar` on a Windows dev machine and only one
 *  of them works here: the bsdtar in System32 reads zip, while the GNU tar that
 *  Git Bash puts earlier on PATH does not ("This does not look like a tar
 *  archive") and additionally reads an absolute "C:\..." as a remote host:path.
 *  Which shell happens to run `npm run electron:build` must not decide whether
 *  the installer gets its models. */
function extractor() {
  const bsdtar = path.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "tar.exe",
  );
  return existsSync(bsdtar) ? bsdtar : "tar";
}

/** Extracts one member from the zip. Relative paths only, with cwd set to the
 *  cache directory, so neither extractor can mistake a drive letter for a host. */
function extractMember(archiveName, member) {
  execFileSync(extractor(), ["-xf", archiveName, member], {
    cwd: CACHE_DIR,
    stdio: "inherit",
  });
  return path.join(CACHE_DIR, member);
}

/** onnxruntime.dll imports these from the Visual C++ 2015-2022 redistributable.
 *  Windows 10+ supplies the api-ms-win-crt-* half (the Universal CRT), but NOT
 *  these — and Electron does not ship them either. A tablet that has never had
 *  the redistributable installed would load the addon fine and then fail to
 *  bring up ONNX Runtime, so they travel with the models. */
const CRT_DLLS = [
  "VCRUNTIME140.dll",
  "VCRUNTIME140_1.dll",
  "MSVCP140.dll",
  "MSVCP140_1.dll",
];

async function listDirectories(parent) {
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function compareVersions(left, right) {
  const l = left.split(".").map(Number);
  const r = right.split(".").map(Number);
  for (let i = 0; i < Math.max(l.length, r.length); i++) {
    const diff = (l[i] ?? 0) - (r[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Prefers Visual Studio's own Redist tree — those are the files Microsoft
 *  licenses for redistribution — over the copies in System32, which are the
 *  machine's installed runtime and merely happen to be the same binaries. */
async function findRedistDirectory() {
  const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]
    .filter(Boolean)
    .map((root) => path.join(root, "Microsoft Visual Studio"));

  const candidates = [];
  for (const root of roots) {
    for (const year of await listDirectories(root)) {
      for (const edition of await listDirectories(path.join(root, year))) {
        const msvc = path.join(root, year, edition, "VC", "Redist", "MSVC");
        for (const version of await listDirectories(msvc)) {
          const x64 = path.join(msvc, version, "x64");
          for (const crt of await listDirectories(x64)) {
            if (crt.startsWith("Microsoft.VC") && crt.endsWith(".CRT")) {
              candidates.push({ version, dir: path.join(x64, crt) });
            }
          }
        }
      }
    }
  }

  candidates.sort((a, b) => compareVersions(a.version, b.version));
  return candidates.at(-1)?.dir ?? null;
}

async function installVcRuntime() {
  const missing = [];
  for (const dll of CRT_DLLS) {
    try {
      await fs.access(path.join(RUNTIME_DIR, dll));
    } catch {
      missing.push(dll);
    }
  }
  if (missing.length === 0) {
    process.stdout.write("  Visual C++ runtime: already installed\n");
    return;
  }

  const redist = await findRedistDirectory();
  const source = redist ?? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  process.stdout.write(`  source: ${source}\n`);
  if (!redist) {
    process.stdout.write(
      "    (no Visual Studio Redist tree found — falling back to the machine's own\n" +
        "     System32 copies, which are the same binaries)\n",
    );
  }

  for (const dll of missing) {
    await fs.copyFile(path.join(source, dll), path.join(RUNTIME_DIR, dll));
    process.stdout.write(`  ${dll}: installed\n`);
  }
}

async function main() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  process.stdout.write("Models (OpenCV Zoo, Apache-2.0/MIT):\n");
  for (const model of MODELS) {
    if (await alreadyInstalled(model.name)) {
      process.stdout.write(`  ${model.name}: already installed\n`);
      continue;
    }
    const bytes = await download(model.url, path.join(RUNTIME_DIR, model.name));
    verify(model.name, bytes);
  }

  process.stdout.write(`\nONNX Runtime ${ONNXRUNTIME_VERSION} (MIT):\n`);
  if (await alreadyInstalled("onnxruntime.dll")) {
    process.stdout.write("  onnxruntime.dll: already installed\n");
  } else {
    await download(
      RUNTIME_ARCHIVE.url,
      path.join(CACHE_DIR, RUNTIME_ARCHIVE.name),
    );
    const extracted = extractMember(
      RUNTIME_ARCHIVE.name,
      RUNTIME_ARCHIVE.member,
    );
    const installed = path.join(RUNTIME_DIR, "onnxruntime.dll");
    await fs.copyFile(extracted, installed);
    verify("onnxruntime.dll", await fs.readFile(installed));
  }

  process.stdout.write("\nVisual C++ runtime (redistributable, app-local):\n");
  await installVcRuntime();

  process.stdout.write(`\nFace runtime ready in ${RUNTIME_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`\nface runtime download failed: ${error.message}\n`);
  process.exitCode = 1;
});

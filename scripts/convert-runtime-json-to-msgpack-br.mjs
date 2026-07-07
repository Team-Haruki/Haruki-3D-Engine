#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, threadId } from "node:worker_threads";
import { encode } from "@msgpack/msgpack";

if (isMainThread) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.root) {
    console.error(
      "usage: node scripts/convert-runtime-json-to-msgpack-br.mjs <runtime-root> [--delete-source] [--workers N]",
    );
    process.exit(2);
  }

  const candidates = collectCandidates(options.root);
  const workers = Math.min(options.workers, Math.max(candidates.length, 1));
  const stats = await convertAll(candidates, {
    deleteSource: options.deleteSource,
    workers,
  });

  console.log(JSON.stringify({
    root: options.root,
    deleteSource: options.deleteSource,
    workers,
    candidates: candidates.length,
    converted: stats.converted,
    jsonGzipBytes: stats.jsonBytes,
    messagePackBrotliBytes: stats.msgpackBrotliBytes,
    deletedSourceFiles: stats.deletedSourceFiles,
    deletedSourceBytes: stats.deletedSourceBytes,
    ratio: stats.jsonBytes === 0 ? null : stats.msgpackBrotliBytes / stats.jsonBytes,
  }, null, 2));
} else {
  parentPort.on("message", (message) => {
    if (message.type === "end") {
      process.exit(0);
    }

    try {
      parentPort.postMessage({
        type: "done",
        stats: convertCandidate(message.candidate, message.deleteSource),
      });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        filePath: message.candidate?.filePath,
        error: error instanceof Error ? error.stack : String(error),
      });
    }
  });
}

function parseArgs(args) {
  let root = null;
  let workers = Math.max(1, Math.min(os.availableParallelism?.() ?? os.cpus().length, 48));
  let deleteSource = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--delete-source") {
      deleteSource = true;
    } else if (arg === "--workers") {
      workers = parseWorkerCount(args[++i]);
    } else if (arg.startsWith("--workers=")) {
      workers = parseWorkerCount(arg.slice("--workers=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (!root) {
      root = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return { root, workers, deleteSource };
}

function parseWorkerCount(value) {
  const workers = Number.parseInt(value, 10);
  if (!Number.isFinite(workers) || workers < 1) {
    throw new Error(`invalid worker count: ${value}`);
  }
  return workers;
}

function collectCandidates(root) {
  const byOutputPath = new Map();
  for (const filePath of walk(root)) {
    const jsonPath = runtimeJsonPath(filePath);
    if (!jsonPath) {
      continue;
    }

    const outputPath = `${jsonPath.slice(0, -".json".length)}.msgpack.br`;
    const candidate = {
      filePath,
      jsonPath,
      outputPath,
      gzip: filePath.endsWith(".gz"),
    };
    const existing = byOutputPath.get(outputPath);
    if (!existing || candidate.gzip) {
      byOutputPath.set(outputPath, candidate);
    }
  }

  return [...byOutputPath.values()].sort((a, b) => a.outputPath.localeCompare(b.outputPath));
}

function convertAll(candidates, options) {
  if (candidates.length === 0) {
    return emptyStats();
  }
  if (options.workers === 1) {
    return Promise.resolve(convertSequential(candidates, options.deleteSource));
  }

  return new Promise((resolve, reject) => {
    const queue = [...candidates];
    const stats = emptyStats();
    let completed = 0;
    let stopped = false;
    let liveWorkers = 0;
    const workerCount = Math.min(options.workers, candidates.length);

    const stop = (error) => {
      if (stopped) {
        return;
      }
      stopped = true;
      reject(error);
    };

    const startNext = (worker) => {
      if (stopped) {
        worker.postMessage({ type: "end" });
        return;
      }
      const candidate = queue.shift();
      if (!candidate) {
        worker.postMessage({ type: "end" });
        return;
      }
      worker.postMessage({
        type: "job",
        candidate,
        deleteSource: options.deleteSource,
      });
    };

    for (let i = 0; i < workerCount; i += 1) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      liveWorkers += 1;
      worker.on("message", (message) => {
        if (message.type === "error") {
          stop(new Error(`failed to convert ${message.filePath}: ${message.error}`));
          return;
        }

        addStats(stats, message.stats);
        completed += 1;
        if (completed % 250 === 0 || completed === candidates.length) {
          console.error(`converted ${completed}/${candidates.length}`);
        }
        startNext(worker);
      });
      worker.on("error", stop);
      worker.on("exit", (code) => {
        liveWorkers -= 1;
        if (!stopped && code !== 0) {
          stop(new Error(`worker exited with code ${code}`));
          return;
        }
        if (!stopped && liveWorkers === 0) {
          resolve(stats);
        }
      });
      startNext(worker);
    }
  });
}

function convertSequential(candidates, deleteSource) {
  const stats = emptyStats();
  for (let i = 0; i < candidates.length; i += 1) {
    addStats(stats, convertCandidate(candidates[i], deleteSource));
    if ((i + 1) % 250 === 0 || i + 1 === candidates.length) {
      console.error(`converted ${i + 1}/${candidates.length}`);
    }
  }
  return stats;
}

function convertCandidate(candidate, deleteSource) {
  const source = fs.readFileSync(candidate.filePath);
  const json = candidate.gzip ? zlib.gunzipSync(source) : source;
  const value = JSON.parse(json.toString("utf8"));
  const packed = encode(value);
  const compressed = zlib.brotliCompressSync(packed, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
    },
  });
  const tempPath = `${candidate.outputPath}.tmp-${process.pid}-${threadId}`;
  fs.writeFileSync(tempPath, compressed);
  fs.renameSync(tempPath, candidate.outputPath);

  const stats = emptyStats();
  stats.converted = 1;
  stats.jsonBytes = source.byteLength;
  stats.msgpackBrotliBytes = compressed.byteLength;

  if (deleteSource) {
    for (const sourcePath of sourcePathsForRemoval(candidate.filePath, candidate.jsonPath)) {
      if (!fs.existsSync(sourcePath)) {
        continue;
      }
      const size = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      stats.deletedSourceFiles += 1;
      stats.deletedSourceBytes += size;
    }
  }

  return stats;
}

function emptyStats() {
  return {
    converted: 0,
    jsonBytes: 0,
    msgpackBrotliBytes: 0,
    deletedSourceFiles: 0,
    deletedSourceBytes: 0,
  };
}

function addStats(target, source) {
  target.converted += source.converted;
  target.jsonBytes += source.jsonBytes;
  target.msgpackBrotliBytes += source.msgpackBrotliBytes;
  target.deletedSourceFiles += source.deletedSourceFiles;
  target.deletedSourceBytes += source.deletedSourceBytes;
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(filePath);
    } else if (entry.isFile()) {
      yield filePath;
    }
  }
}

function runtimeJsonPath(filePath) {
  if (filePath.endsWith(".json.gz")) {
    return filePath.slice(0, -".gz".length);
  }
  if (!filePath.endsWith(".json")) {
    return null;
  }
  if (fs.existsSync(`${filePath}.gz`)) {
    return null;
  }
  return filePath;
}

function sourcePathsForRemoval(filePath, jsonPath) {
  const paths = [filePath];
  if (filePath.endsWith(".json.gz")) {
    paths.push(jsonPath);
  }
  return paths;
}

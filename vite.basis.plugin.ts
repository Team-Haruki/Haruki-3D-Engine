import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const basisRoot = path.resolve("node_modules/three/examples/jsm/libs/basis");
const basisFiles = ["basis_transcoder.js", "basis_transcoder.wasm"];

export function copyBasisTranscoder(): Plugin {
  return {
    name: "haruki-basis-transcoder",
    configureServer(server) {
      server.middlewares.use("/basis", (request, response, next) => {
        const name = path.basename(request.url?.split("?", 1)[0] ?? "");
        if (!basisFiles.includes(name)) return next();
        response.setHeader(
          "content-type",
          name.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8"
        );
        fs.createReadStream(path.join(basisRoot, name)).pipe(response);
      });
    },
    closeBundle() {
      const output = path.resolve("dist/basis");
      fs.mkdirSync(output, { recursive: true });
      for (const name of basisFiles) {
        fs.copyFileSync(path.join(basisRoot, name), path.join(output, name));
      }
    },
  };
}

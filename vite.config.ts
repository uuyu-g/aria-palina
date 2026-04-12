import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@aria-palina/core": resolve(root, "packages/core/src/index.ts"),
    },
  },
};

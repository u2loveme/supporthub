import { quotaarcRelease } from "./quotaarc-release.js";
import { handleDownloadRequest } from "./assets/download-attribution-core.js";

const downloadPaths = new Set([
  "/quotaarc/download",
  "/quotaarc/download/",
  "/uk/quotaarc/download",
  "/uk/quotaarc/download/"
]);

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (downloadPaths.has(pathname)) {
      return handleDownloadRequest(request, env, quotaarcRelease);
    }
    return env.ASSETS.fetch(request);
  }
};

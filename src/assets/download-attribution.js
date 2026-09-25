import { appendAttribution } from "./download-attribution-core.js";

const downloadLink = document.querySelector("[data-download-attribution]");
if (downloadLink) {
  downloadLink.href = appendAttribution(downloadLink.href, window.location.href);
}

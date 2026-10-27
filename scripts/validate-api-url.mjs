import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Only an HTTPS API origin may be embedded in the public production bundle. */
export function isValidProductionApiUrl(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      (value === url.origin || value === url.origin + "/") &&
      url.username === "" && url.password === "" &&
      host !== "localhost" && !host.endsWith(".localhost") &&
      host !== "127.0.0.1" && host !== "[::1]" &&
      host !== "0.0.0.0";
  } catch {
    return false;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!isValidProductionApiUrl(process.env.VITE_API_URL)) {
    // Never print the value: it may have been set to a credential by mistake.
    console.error("Invalid or missing VITE_API_URL: configure an HTTPS API origin in GitHub Actions Variables.");
    process.exitCode = 1;
  }
}

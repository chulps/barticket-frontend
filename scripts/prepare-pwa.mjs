import { writeFileSync } from "node:fs";

const rawBase = process.env.BASE_PATH || "/";
if (!rawBase.startsWith("/") || rawBase.includes("..") || rawBase.includes("?") || rawBase.includes("#")) {
  throw new Error("BASE_PATH must be a safe absolute URL path");
}
const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
const manifest = {
  id: base,
  name: "BarTicket",
  short_name: "BarTicket",
  description: "BarTicket shared bar tabs and shift notebook",
  start_url: base,
  scope: base,
  display: "standalone",
  background_color: "#000000",
  theme_color: "#000000",
  icons: [
    { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
};
writeFileSync("public/manifest.webmanifest", JSON.stringify(manifest, null, 2) + "\n");
console.log("Generated PWA manifest for", base);

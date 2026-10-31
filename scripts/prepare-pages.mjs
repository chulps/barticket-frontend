import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** App's literal static routes are the source of truth. Parameterized routes
 * retain the Pages 404 shell; no IDs or private data are emitted at build time. */
export function preparePages(distDirectory = "dist", routeSource = "src/App.tsx") {
    const html = resolve(distDirectory, "index.html");
    const source = readFileSync(routeSource, "utf8");
    const routes = [...source.matchAll(/<Route\s+path="([^"]+)"/g)]
        .map(match => match[1])
        .filter(route => route !== "/" && !route.includes(":") && !route.includes("*"));
    if (!routes.length) throw new Error("No literal static App routes found for Pages");
    copyFileSync(html, resolve(distDirectory, "404.html"));
    for (const route of new Set(routes)) {
        if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(route)) {
            throw new Error(`Unsupported static route: ${route}`);
        }
        const destination = resolve(distDirectory, route.slice(1), "index.html");
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(html, destination);
    }
    return [...new Set(routes)];
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const routes = preparePages(process.argv[2] ?? "dist");
    console.log(`Prepared Pages entries for ${routes.join(", ")}; dynamic routes retain the 404 shell.`);
}

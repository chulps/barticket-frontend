import {test, expect} from "@playwright/test";

function contrastRatio(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const locale of ["en", "ja"]) for (const width of [390, 768]) {
  test(`paid summary uses readable semantic foregrounds ${locale} ${width}px`, async ({page}, info) => {
    await page.addInitScript(locale => localStorage.setItem("barticket_locale", locale), locale);
    await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    await page.setViewportSize({width, height: 900});
    await page.goto("/tests/browser/fixtures/paid-ticket-summary.html");

    const statusLabel = locale === "ja" ? "状態:" : "Status:";
    const summary = page.locator("section").filter({has: page.getByText(statusLabel, {exact: true})});
    await expect(summary).toBeVisible();
    const colors = await summary.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      labels: [...element.querySelectorAll("label")].map(label => getComputedStyle(label).color),
      icons: [...element.querySelectorAll("svg")].map(icon => getComputedStyle(icon).color),
    }));
    expect(colors.background).toBe("rgb(28, 64, 48)");
    expect(colors.labels).toHaveLength(4);
    expect(colors.icons).toHaveLength(4);
    for (const foreground of colors.labels) expect(contrastRatio(foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    for (const foreground of colors.icons) expect(contrastRatio(foreground, colors.background)).toBeGreaterThanOrEqual(3);
    await summary.screenshot({path: info.outputPath("paid-ticket-summary.png")});
  });
}

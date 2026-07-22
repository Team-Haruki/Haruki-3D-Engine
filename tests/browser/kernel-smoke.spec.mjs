import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 2 });

test("capture kernel boots with WebGL and no page errors", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/capture.html?captureBase=/runtime/jp/");
  await expect.poll(async () => ({
    ready: await page.locator("body").getAttribute("data-capture-ready"),
    captureError: await page.locator("body").getAttribute("data-capture-error"),
    pageErrors,
    consoleErrors,
  })).toEqual({ ready: "true", captureError: null, pageErrors: [], consoleErrors: [] });

  const state = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      hasCanvas: canvas instanceof HTMLCanvasElement,
      drawingBufferSize: canvas ? [canvas.width, canvas.height] : null,
      hasRequestHandler: typeof window.__HARUKI_CAPTURE_REQUEST__ === "function",
      hasWebGL: Boolean(
        canvas?.getContext("webgl2")
        ?? canvas?.getContext("webgl")
        ?? canvas?.getContext("experimental-webgl")
      ),
      captureError: document.body.dataset.captureError ?? "",
    };
  });

  expect(state).toEqual({
    hasCanvas: true,
    drawingBufferSize: [2048, 2048],
    hasRequestHandler: true,
    hasWebGL: true,
    captureError: "",
  });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

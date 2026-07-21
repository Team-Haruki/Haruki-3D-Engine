import { expect, test } from "@playwright/test";

test("capture kernel boots with WebGL and no page errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/capture.html?captureBase=/runtime/jp/");
  await expect.poll(async () => ({
    ready: await page.locator("body").getAttribute("data-capture-ready"),
    captureError: await page.locator("body").getAttribute("data-capture-error"),
    pageErrors,
  })).toEqual({ ready: "true", captureError: null, pageErrors: [] });

  const state = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      hasCanvas: canvas instanceof HTMLCanvasElement,
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
    hasRequestHandler: true,
    hasWebGL: true,
    captureError: "",
  });
  expect(pageErrors).toEqual([]);
});

// Runs simulations off the main thread so the page stays responsive.
import { runStudy } from "./analysis";
import { validate, type Settings } from "./model";

self.onmessage = (e: MessageEvent<Settings>) => {
  const errors = validate(e.data);
  if (errors.length) {
    self.postMessage({ type: "error", errors });
    return;
  }
  try {
    const result = runStudy(e.data, (done) => self.postMessage({ type: "progress", done, total: e.data.nPaths }));
    self.postMessage({ type: "result", result });
  } catch (err) {
    self.postMessage({ type: "error", errors: [String(err)] });
  }
};

import { describeBrowserProblem, browserProblem, BrowserCapabilities } from "./BrowserSupport";

const ready: BrowserCapabilities = {
    webAssembly: true,
    crossOriginIsolated: true,
    sharedArrayBuffer: true,
    offscreenCanvas: true,
    transferControlToOffscreen: true,
    webgl2: true,
    workerWebgl2: true,
};

test("accepts a browser that can draw on a worker", () => {
    expect(describeBrowserProblem(ready)).toBeNull();
});

test("names each missing capability", () => {
    expect(describeBrowserProblem({ ...ready, webAssembly: false })).toMatch(/WebAssembly/);
    expect(describeBrowserProblem({ ...ready, crossOriginIsolated: false })).toMatch(/cross-origin isolated/);
    expect(describeBrowserProblem({ ...ready, sharedArrayBuffer: false })).toMatch(/Cross-Origin-Opener-Policy/);
    expect(describeBrowserProblem({ ...ready, offscreenCanvas: false })).toMatch(/worker/);
    expect(describeBrowserProblem({ ...ready, transferControlToOffscreen: false })).toMatch(/worker/);
    expect(describeBrowserProblem({ ...ready, webgl2: false })).toMatch(/WebGL2/);
    expect(describeBrowserProblem({ ...ready, workerWebgl2: false })).toMatch(/WebGL2 from a worker/);
});

test("reports this test page cannot start threads", async () => {
    const problem = await browserProblem();
    expect(problem).toMatch(/cross-origin isolated/);
});

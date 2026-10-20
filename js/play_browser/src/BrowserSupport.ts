export type BrowserCapabilities = {
    webAssembly: boolean,
    crossOriginIsolated: boolean,
    sharedArrayBuffer: boolean,
    offscreenCanvas: boolean,
    transferControlToOffscreen: boolean,
    webgl2: boolean,
    workerWebgl2: boolean,
};

const WORKER_PROBE_MS = 2000;

// The GS thread draws on a transferred canvas. A browser can advertise
// OffscreenCanvas and still refuse WebGL2 inside the worker.
const WORKER_PROBE = `
self.onmessage = function(event) {
    var ok = false;
    try {
        ok = !!event.data.canvas.getContext("webgl2");
    } catch (error) {
        ok = false;
    }
    self.postMessage(ok);
};
`;

export function describeBrowserProblem(caps: BrowserCapabilities): string | null {
    if(!caps.webAssembly) {
        return "This browser has no WebAssembly. Chrome or Firefox can run Play!.";
    }
    if(!caps.crossOriginIsolated || !caps.sharedArrayBuffer) {
        return "Play! needs a cross-origin isolated page so it can start threads. The host has to send Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy. Chrome or Firefox can run it once those headers are present.";
    }
    if(!caps.offscreenCanvas || !caps.transferControlToOffscreen) {
        return "This browser cannot hand the picture to a worker. Chrome or Firefox can.";
    }
    if(!caps.webgl2) {
        return "This browser has no WebGL2. Chrome or Firefox can run Play!.";
    }
    if(!caps.workerWebgl2) {
        return "This browser cannot draw WebGL2 from a worker. Chrome or Firefox can.";
    }
    return null;
}

function probeWorkerWebgl2(): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        let worker: Worker | null = null;
        let url: string | null = null;
        const finish = (ok: boolean) => {
            if(settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timer);
            if(worker) {
                worker.terminate();
            }
            if(url) {
                URL.revokeObjectURL(url);
            }
            resolve(ok);
        };
        const timer = window.setTimeout(() => finish(false), WORKER_PROBE_MS);
        try {
            const canvas = document.createElement("canvas");
            if(typeof canvas.transferControlToOffscreen !== "function") {
                finish(false);
                return;
            }
            const offscreen = canvas.transferControlToOffscreen();
            const blob = new Blob([WORKER_PROBE], { type: "text/javascript" });
            url = URL.createObjectURL(blob);
            worker = new Worker(url);
            worker.onmessage = (event) => finish(event.data === true);
            worker.onerror = () => finish(false);
            worker.postMessage({ canvas: offscreen }, [offscreen]);
        } catch {
            finish(false);
        }
    });
}

export async function readBrowserCapabilities(): Promise<BrowserCapabilities> {
    const webAssembly = typeof WebAssembly !== "undefined";
    const sharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
    const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true;
    if(!webAssembly || !isolated || !sharedArrayBuffer) {
        return {
            webAssembly,
            crossOriginIsolated: isolated,
            sharedArrayBuffer,
            offscreenCanvas: false,
            transferControlToOffscreen: false,
            webgl2: false,
            workerWebgl2: false,
        };
    }
    const offscreenCanvas = typeof OffscreenCanvas !== "undefined";
    let transferControlToOffscreen = false;
    let webgl2 = false;
    try {
        const canvas = document.createElement("canvas");
        transferControlToOffscreen = typeof canvas.transferControlToOffscreen === "function";
        const gl = document.createElement("canvas").getContext("webgl2");
        webgl2 = !!gl;
    } catch {
        transferControlToOffscreen = false;
        webgl2 = false;
    }
    const workerWebgl2 = offscreenCanvas && transferControlToOffscreen && webgl2
        ? await probeWorkerWebgl2()
        : false;
    return {
        webAssembly,
        crossOriginIsolated: isolated,
        sharedArrayBuffer,
        offscreenCanvas,
        transferControlToOffscreen,
        webgl2,
        workerWebgl2,
    };
}

export async function browserProblem(): Promise<string | null> {
    return describeBrowserProblem(await readBrowserCapabilities());
}

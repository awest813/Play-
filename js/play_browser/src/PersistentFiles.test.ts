import { mountPersistentFiles, requestPersistentSync, startPersistentSync } from "./PersistentFiles";

function moduleWithSync(syncfs: jest.Mock) {
    return {
        FS: {
            filesystems: { IDBFS: { kind: "idbfs" } },
            mount: jest.fn(),
            syncfs,
        },
    };
}

test("loads IndexedDB into the data directory before resolving", async () => {
    const syncfs = jest.fn((populate: boolean, callback: (err: null) => void) => {
        expect(populate).toBe(true);
        callback(null);
    });
    const module = moduleWithSync(syncfs);
    await mountPersistentFiles(module, "/home/web_user/.local/share/Play Data Files");
    expect(module.FS.mount).toHaveBeenCalledWith({ kind: "idbfs" }, {}, "/home/web_user/.local/share/Play Data Files");
});

test("rejects a build that has no IDBFS", async () => {
    await expect(mountPersistentFiles({ FS: { filesystems: {}, mount: jest.fn() } }, "/data")).rejects.toThrow(/cannot store saves/);
});

test("waits for the in-flight sync before starting the next one", async () => {
    const pending: ((err: null) => void)[] = [];
    const syncfs = jest.fn((_populate: boolean, callback: (err: null) => void) => {
        pending.push(callback);
    });
    const module = moduleWithSync(syncfs);
    const first = requestPersistentSync(module);
    const second = requestPersistentSync(module);
    expect(syncfs).toHaveBeenCalledTimes(1);
    pending[0](null);
    await first;
    expect(syncfs).toHaveBeenCalledTimes(2);
    pending[1](null);
    await second;
});

test("writes saves back on a timer and when the page hides", () => {
    jest.useFakeTimers();
    const syncfs = jest.fn((_populate: boolean, callback: (err: null) => void) => callback(null));
    const module = moduleWithSync(syncfs);
    const stop = startPersistentSync(module);
    jest.advanceTimersByTime(8000);
    expect(syncfs).toHaveBeenCalledWith(false, expect.any(Function));
    syncfs.mockClear();

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(syncfs).toHaveBeenCalledTimes(1);
    syncfs.mockClear();

    window.dispatchEvent(new Event("pagehide"));
    expect(syncfs).toHaveBeenCalledTimes(1);

    stop();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    jest.useRealTimers();
});

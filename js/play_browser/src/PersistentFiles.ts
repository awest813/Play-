type SyncJob = {
    populate: boolean,
    resolve: () => void,
    reject: (error: Error) => void,
};

const jobs: SyncJob[] = [];
let syncing = false;
let autoSyncStop: (() => void) | null = null;

function asError(err: unknown): Error {
    if(err instanceof Error) {
        return err;
    }
    return new Error("Could not store saves in this browser.");
}

// IndexedDB syncs cannot overlap. A populate has to finish alone; later
// write-backs collapse into one trip.
function drain(module: any) {
    if(syncing || jobs.length === 0) {
        return;
    }
    const job = jobs.shift();
    if(!job) {
        return;
    }
    const batch = [job];
    if(!job.populate) {
        while(jobs.length > 0 && !jobs[0].populate) {
            const next = jobs.shift();
            if(next) {
                batch.push(next);
            }
        }
    }
    syncing = true;
    module.FS.syncfs(job.populate, (err: unknown) => {
        syncing = false;
        if(err) {
            const error = asError(err);
            batch.forEach((item) => item.reject(error));
        } else {
            batch.forEach((item) => item.resolve());
        }
        drain(module);
    });
}

function enqueue(module: any, populate: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        jobs.push({ populate, resolve, reject });
        drain(module);
    });
}

export function mountPersistentFiles(module: any, path: string): Promise<void> {
    const idbfs = module.FS && module.FS.filesystems && module.FS.filesystems.IDBFS;
    if(!idbfs) {
        return Promise.reject(new Error("This build cannot store saves in the browser."));
    }
    module.FS.mount(idbfs, {}, path);
    return enqueue(module, true);
}

export function requestPersistentSync(module: any): Promise<void> {
    return enqueue(module, false);
}

// Memory-card writes keep going on the emulator thread, so this is best-effort.
// An explicit save waits for its own sync after the file is written.
export function startPersistentSync(module: any): () => void {
    if(autoSyncStop) {
        return autoSyncStop;
    }
    // Nobody waits on these trips. A failure is retried by the next one.
    const sync = () => {
        requestPersistentSync(module).catch(() => {});
    };
    const timer = window.setInterval(sync, 8000);
    const onHide = () => {
        if(document.visibilityState === "hidden") {
            sync();
        }
    };
    const onPageHide = sync;
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    autoSyncStop = () => {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", onPageHide);
        autoSyncStop = null;
    };
    return autoSyncStop;
}

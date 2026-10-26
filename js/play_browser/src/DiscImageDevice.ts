export function readArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    if(typeof blob.arrayBuffer === "function") {
        return blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if(reader.result instanceof ArrayBuffer) {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to read file."));
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
        reader.readAsArrayBuffer(blob);
    });
}

export default class DiscImageDevice {
    module: any;
    private doneFlag = false;
    private errorMessage = "";
    private bytesRead = 0;
    private requestId = 0;
    private file: File | null = null;

    constructor(module: any) {
        this.module = module;
    }

    read(dstPtr: number, offset: number, size: number, flagPtr = 0) {
        const requestId = ++this.requestId;
        this.doneFlag = false;
        this.errorMessage = "";
        this.bytesRead = 0;
        // A disc swap replaces this.file while the running game can still be
        // waiting on this read. Finish it from the file it started on: an error
        // would throw on the emulator thread just before the reset.
        const file = this.file;
        const finish = (isError: boolean, count: number, message: string) => {
            if(requestId === this.requestId) {
                this.errorMessage = isError ? message : "";
                this.bytesRead = isError ? 0 : count;
                this.doneFlag = true;
            }
            this.signal(flagPtr, isError, isError ? 0 : count);
        };
        if(!file) {
            finish(true, 0, "No file set.");
            return;
        }
        const subsection = file.slice(offset, offset + size);
        readArrayBuffer(subsection).then((value: ArrayBuffer) => {
            const bytes = new Uint8Array(value);
            const count = Math.min(bytes.length, size);
            this.module.HEAPU8.set(bytes.subarray(0, count), dstPtr);
            finish(false, count, "");
        }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Failed to read disc image.";
            finish(true, 0, message);
        });
    }

    // Layout matches DISC_READ_SLOT: done, error, bytesRead. done is the futex word.
    private signal(flagPtr: number, isError: boolean, byteCount: number) {
        const heap = this.module.HEAP32 as Int32Array | undefined;
        if(!flagPtr || !heap) {
            return;
        }
        const index = flagPtr >>> 2;
        Atomics.store(heap, index + 1, isError ? 1 : 0);
        Atomics.store(heap, index + 2, byteCount >>> 0);
        Atomics.store(heap, index, 1);
        Atomics.notify(heap, index, 1);
    }

    getFileSize() {
        if(!this.file) {
            throw new Error("No file set.");
        }
        return this.file.size;
    }

    getFileSizeLow() {
        return this.getFileSize() >>> 0;
    }

    getFileSizeHigh() {
        return Math.floor(this.getFileSize() / 4294967296);
    }

    isDone() {
        return this.doneFlag;
    }

    hasError() {
        return this.errorMessage !== "";
    }

    getError() {
        return this.errorMessage;
    }

    getBytesRead() {
        return this.bytesRead;
    }

    setFile(file : File) {
        this.file = file;
        this.requestId++;
        this.doneFlag = false;
        this.errorMessage = "";
        this.bytesRead = 0;
    }

};

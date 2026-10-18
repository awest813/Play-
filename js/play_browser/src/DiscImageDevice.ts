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

    read(dstPtr: number, offset: number, size: number) {
        const requestId = ++this.requestId;
        this.doneFlag = false;
        this.errorMessage = "";
        this.bytesRead = 0;
        if(!this.file) {
            this.fail(requestId, "No file set.");
            return;
        }
        const subsection = this.file.slice(offset, offset + size);
        readArrayBuffer(subsection).then((value: ArrayBuffer) => {
            if(requestId !== this.requestId) {
                return;
            }
            const bytes = new Uint8Array(value);
            this.module.HEAPU8.set(bytes, dstPtr);
            this.bytesRead = bytes.length;
            this.doneFlag = true;
        }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Failed to read disc image.";
            this.fail(requestId, message);
        });
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

    private fail(requestId: number, message: string) {
        if(requestId !== this.requestId) {
            return;
        }
        this.errorMessage = message;
        this.bytesRead = 0;
        this.doneFlag = true;
    }
};

import { configureStore, createAsyncThunk, createReducer } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { PlayModule, initPlayModule } from './PlayModule';
import { readArrayBuffer } from './DiscImageDevice';

export type PlayStatus = "loading" | "ready" | "booting" | "running" | "error";

export type PlayState = {
    status: PlayStatus,
    message: string,
    moduleReady: boolean,
};

let initialState : PlayState = {
    status: "loading",
    message: "Loading emulator...",
    moduleReady: false,
};

export const init = createAsyncThunk<void>('init',
    async () => {
        await initPlayModule();
    }
);

function baseName(fileName: string) {
    const parts = fileName.split(/[/\\]/);
    return parts[parts.length - 1] || "game.elf";
}

const DISC_EXTENSIONS = [".iso", ".cso", ".chd", ".isz", ".bin"];

// Older Play.js builds return as soon as the boot is queued. A build that
// exports bootReportsResult resolves this once the VM thread finishes.
function bootAndWait(start: () => void): Promise<void> {
    const reportsResult = typeof PlayModule.bootReportsResult === "function" && PlayModule.bootReportsResult() !== 0;
    if(!reportsResult) {
        start();
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        PlayModule.onBootResult = (success: number, message: string) => {
            PlayModule.onBootResult = null;
            if(success) {
                resolve();
            } else {
                reject(new Error(message || "Failed to start."));
            }
        };
        try {
            start();
        } catch(error) {
            PlayModule.onBootResult = null;
            reject(error instanceof Error ? error : new Error("Failed to start."));
        }
    });
}

export const bootFile = createAsyncThunk<void, File, { rejectValue: string }>('bootFile',
    async (file : File, thunkAPI) => {
        const fileName = baseName(file.name);
        const fileDotPos = fileName.lastIndexOf('.');
        if(fileDotPos === -1) {
            return thunkAPI.rejectWithValue("File name must have an extension.");
        }
        const fileExtension = fileName.substring(fileDotPos).toLowerCase();
        if(fileExtension === ".elf") {
            let stream : number | null = null;
            try {
                const data = new Uint8Array(await readArrayBuffer(file));
                const storageName = `/work/${fileName}`;
                stream = PlayModule.FS.open(storageName, "w+");
                PlayModule.FS.write(stream, data, 0, data.length, 0);
                PlayModule.FS.close(stream);
                stream = null;
                await bootAndWait(() => PlayModule.bootElf(storageName));
            } catch(error) {
                if(stream !== null) {
                    try {
                        PlayModule.FS.close(stream);
                    } catch {
                        // The original read or write error is the one to report.
                    }
                }
                const message = error instanceof Error ? error.message : "Failed to read ELF.";
                return thunkAPI.rejectWithValue(message);
            }
        } else if(DISC_EXTENSIONS.indexOf(fileExtension) !== -1) {
            PlayModule.discImageDevice.setFile(file);
            try {
                await bootAndWait(() => PlayModule.bootDiscImage(fileName));
            } catch(error) {
                const message = error instanceof Error ? error.message : "Failed to start.";
                return thunkAPI.rejectWithValue(message);
            }
        } else {
            return thunkAPI.rejectWithValue("Supported files are ISO, CSO, CHD, ISZ, BIN, and ELF.");
        }
    }
);

const reducer = createReducer(initialState, (builder) => (
    builder
        .addCase(init.fulfilled, (state) => {
            state.status = "ready";
            state.message = "Drop a disc image or an ELF file on the picture.";
            state.moduleReady = true;
        })
        .addCase(init.rejected, (state, action) => {
            state.status = "error";
            state.message = action.error.message ?? "Failed to load emulator.";
            state.moduleReady = false;
        })
        .addCase(bootFile.pending, (state, action) => {
            state.status = "booting";
            state.message = `Loading ${action.meta.arg.name}...`;
        })
        .addCase(bootFile.fulfilled, (state) => {
            state.status = "running";
            state.message = "Running. Click the picture if the keys do nothing.";
        })
        .addCase(bootFile.rejected, (state, action) => {
            state.status = "error";
            state.message = action.payload ?? action.error.message ?? "Failed to load file.";
        })
));

export function createPlayStore() {
    return configureStore({
        reducer: { play: reducer }
    });
}

export const store = createPlayStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

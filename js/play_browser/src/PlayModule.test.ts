import Play from "./Play";
import { browserProblem } from "./BrowserSupport";
import { mountPersistentFiles, startPersistentSync } from "./PersistentFiles";
import { initPlayModule } from "./PlayModule";

jest.mock("./Play", () => ({
    __esModule: true,
    default: jest.fn(),
}), { virtual: true });

jest.mock("./BrowserSupport", () => ({
    browserProblem: jest.fn(),
}));

jest.mock("./PersistentFiles", () => ({
    mountPersistentFiles: jest.fn(),
    startPersistentSync: jest.fn(),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

test("mounts persistent files before the virtual machine starts", async () => {
    const order: string[] = [];
    (browserProblem as jest.Mock).mockImplementation(async () => {
        order.push("browser");
        return null;
    });
    (Play as unknown as jest.Mock).mockImplementation(async () => ({
        FS: {
            mkdir() {
                order.push("mkdir");
            },
            filesystems: { IDBFS: {} },
        },
        persistentDataPath() {
            order.push("path");
            return "/home/web_user/.local/share/Play Data Files";
        },
        ccall(name: string) {
            order.push(name);
        },
    }));
    (mountPersistentFiles as jest.Mock).mockImplementation(async () => {
        order.push("mount");
    });
    (startPersistentSync as jest.Mock).mockImplementation(() => {
        order.push("autosync");
    });

    await initPlayModule();

    expect(order).toEqual(["browser", "mkdir", "path", "mount", "autosync", "initVm"]);
});

test("does not instantiate the module when the browser cannot run it", async () => {
    (browserProblem as jest.Mock).mockResolvedValue("This browser has no WebGL2. Chrome or Firefox can run Play!.");
    await expect(initPlayModule()).rejects.toThrow(/WebGL2/);
    expect(Play).not.toHaveBeenCalled();
});

test("still starts when an older build has no persistent path", async () => {
    const order: string[] = [];
    (browserProblem as jest.Mock).mockResolvedValue(null);
    (Play as unknown as jest.Mock).mockImplementation(async () => ({
        FS: {
            mkdir() {
                order.push("mkdir");
            },
            filesystems: {},
        },
        ccall(name: string) {
            order.push(name);
        },
    }));

    await initPlayModule();

    expect(order).toEqual(["mkdir", "initVm"]);
    expect(mountPersistentFiles).not.toHaveBeenCalled();
});

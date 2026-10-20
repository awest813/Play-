import Play from "./Play";
import DiscImageDevice from "./DiscImageDevice";
import { browserProblem } from "./BrowserSupport";
import { mountPersistentFiles, requestPersistentSync, startPersistentSync } from "./PersistentFiles";

export let PlayModule : any = null;

let module_overrides = {
    locateFile: function(path : string) {
        const baseURL = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf( "/" ));
        return baseURL + '/' + path;
    },
    mainScriptUrlOrBlob: "",
};

export let initPlayModule = async function() {
    const problem = await browserProblem();
    if(problem) {
        throw new Error(problem);
    }
    module_overrides.mainScriptUrlOrBlob = module_overrides.locateFile('Play.js');
    PlayModule = await Play(module_overrides);
    PlayModule.FS.mkdir("/work");
    PlayModule.discImageDevice = new DiscImageDevice(PlayModule);
    // Mount before initVm so mc0, states/, and config.xml are created inside
    // IDBFS. initVm then reads config.xml, so the populate has to finish first.
    const idbfs = PlayModule.FS.filesystems && PlayModule.FS.filesystems.IDBFS;
    const persist = !!(idbfs && typeof PlayModule.persistentDataPath === "function");
    if(persist) {
        const dataPath = PlayModule.persistentDataPath();
        await mountPersistentFiles(PlayModule, dataPath);
        startPersistentSync(PlayModule);
    }
    PlayModule.ccall("initVm", "", [], []);
    if(persist) {
        try {
            await requestPersistentSync(PlayModule);
        } catch {
            // The files are still in the mount for this session.
        }
    }
};

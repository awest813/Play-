import Play from "./Play";
import DiscImageDevice from "./DiscImageDevice";
import { browserProblem } from "./BrowserSupport";
import { mountPersistentFiles, startPersistentSync } from "./PersistentFiles";

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
    // Mount before initVm so mc0 and states/ are created inside IDBFS.
    const idbfs = PlayModule.FS.filesystems && PlayModule.FS.filesystems.IDBFS;
    if(idbfs && typeof PlayModule.persistentDataPath === "function") {
        const dataPath = PlayModule.persistentDataPath();
        await mountPersistentFiles(PlayModule, dataPath);
        startPersistentSync(PlayModule);
    }
    PlayModule.ccall("initVm", "", [], []);
};

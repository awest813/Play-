import './App.css';
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { PlayModule } from './PlayModule';
import { useAppDispatch, useAppSelector, bootFile, queryState, saveState, loadState } from "./Actions";

type Binding = {
  name: string,
  keys: string[],
  detail?: string,
};

const CONTROL_GROUPS: { title: string, rows: Binding[] }[] = [
  {
    title: "Move",
    rows: [
      { name: "D-pad", keys: ["←", "↑", "↓", "→"] },
      { name: "Left stick", keys: ["F", "H", "T", "G"], detail: "left, right, up, down" },
      { name: "Right stick", keys: ["J", "L", "I", "K"], detail: "left, right, up, down" },
    ],
  },
  {
    title: "Face",
    rows: [
      { name: "Square", keys: ["A"] },
      { name: "Triangle", keys: ["S"] },
      { name: "Cross", keys: ["Z"] },
      { name: "Circle", keys: ["X"] },
    ],
  },
  {
    title: "Shoulders",
    rows: [
      { name: "L1", keys: ["1"] },
      { name: "L2", keys: ["2"] },
      { name: "L3", keys: ["3"] },
      { name: "R1", keys: ["8"] },
      { name: "R2", keys: ["9"] },
      { name: "R3", keys: ["0"] },
    ],
  },
  {
    title: "Menu",
    rows: [
      { name: "Start", keys: ["Enter"] },
      { name: "Select", keys: ["Backspace"] },
    ],
  },
];

function focusCanvas() {
  const canvas = document.getElementById("outputCanvas");
  if(canvas instanceof HTMLElement) {
    canvas.focus();
  }
}

function Stats() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      if(!PlayModule) {
        return;
      }
      const frames = PlayModule.getFrames();
      PlayModule.clearStats();
      setFps(frames);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return (
    <span className="stats">{fps === null ? "— f/s" : `${fps} f/s`}</span>
  );
}

function KeyboardMap() {
  return (
    <section className="controls" aria-label="Keyboard">
      <h2>Keyboard</h2>
      <p className="controls-note">Click the picture, then use these keys. The number row and the numpad both hit the shoulder buttons.</p>
      <div className="control-groups">
        {CONTROL_GROUPS.map((group) => (
          <div className="control-group" key={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {group.rows.map((row) => (
                <li className="binding" key={row.name}>
                  <span className="binding-name">{row.name}</span>
                  <span className="binding-keys">
                    {row.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                  </span>
                  {row.detail ? <span className="binding-detail">{row.detail}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const state = useAppSelector((playState) => playState.play);
  const dispatch = useAppDispatch();
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canBoot = state.moduleReady && state.status !== "booting" && !state.stateBusy;

  useEffect(() => {
    if(state.status !== "running") {
      return;
    }
    focusCanvas();
    if(PlayModule && typeof PlayModule.queryStateSlot === "function") {
      dispatch(queryState());
    }
  }, [state.status, dispatch]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const boot = function(file: File) {
    setFileName(file.name);
    focusCanvas();
    dispatch(bootFile(file));
  };

  const handleChange = function(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files && input.files.length !== 0 ? input.files[0] : null;
    // A second pick of the same path does not fire change unless the value is cleared.
    input.value = "";
    if(file) {
      boot(file);
    }
  };

  const handleDragEnter = function(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if(!canBoot) {
      return;
    }
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = function(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  };

  const handleDragLeave = function(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if(dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };

  const handleDrop = function(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if(!canBoot) {
      return;
    }
    const file = event.dataTransfer.files[0];
    if(file) {
      boot(file);
    }
  };

  const rememberCanvas = function() {
    window.setTimeout(focusCanvas, 0);
  };

  const toggleFullscreen = async function() {
    const stage = document.getElementById("stage");
    if(!(stage instanceof HTMLElement)) {
      return;
    }
    try {
      if(document.fullscreenElement) {
        await document.exitFullscreen();
      } else if(typeof stage.requestFullscreen === "function") {
        await stage.requestFullscreen();
      }
      focusCanvas();
    } catch {
      // The browser can reject fullscreen when the click is not a user gesture.
    }
  };

  const showOverlay = state.status !== "running";
  const statusClass = state.status === "error" ? "status status-error" : "status";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <p className="brand-name">Play!</p>
          <p className="brand-tag">PlayStation 2 in the browser</p>
        </div>
        <nav className="nav" aria-label="Project">
          <a href="https://purei.org" target="_blank" rel="noopener noreferrer">Website</a>
          <a href="https://github.com/jpd002/Play-" target="_blank" rel="noopener noreferrer">Source</a>
          <a href="https://github.com/jpd002/Play-Compatibility/issues" target="_blank" rel="noopener noreferrer">Compatibility</a>
          <span className="version">{`Version ${process.env.REACT_APP_VERSION || "dev"}`}</span>
        </nav>
      </header>
      <div className="workspace">
        <section className="stage" id="stage" aria-label="Game">
          <div
            className={dragging ? "picture drag-over" : "picture"}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <canvas id="outputCanvas" width={640} height={480} tabIndex={0} aria-label="Game picture"></canvas>
            {showOverlay ? (
              <div className="overlay">
                {state.status === "loading" || state.status === "booting" ? <span className="spinner" aria-hidden="true" /> : null}
                {state.status === "ready" ? <p className="overlay-title">Drop a disc here</p> : null}
                {state.status === "error" ? (
                  <p className="overlay-title">{state.moduleReady ? "Could not start" : "Cannot run here"}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="stage-bar">
            <div className="stage-status">
              {fileName ? <p className="now-playing">{fileName}</p> : null}
              <p className={statusClass} role="status">{state.message}</p>
            </div>
            <div className="stage-actions">
              <Stats />
              {state.moduleReady ? (
                <label className="button button-primary">
                  Open disc or ELF
                  <input
                    className="visually-hidden"
                    type="file"
                    accept=".iso,.cso,.chd,.isz,.bin,.elf"
                    onChange={handleChange}
                    disabled={!canBoot}
                  />
                </label>
              ) : null}
              {state.status === "running" ? (
                <>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      dispatch(saveState());
                      rememberCanvas();
                    }}
                    disabled={state.stateBusy}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      dispatch(loadState());
                      rememberCanvas();
                    }}
                    disabled={state.stateBusy || !state.stateAvailable}
                  >
                    Load
                  </button>
                </>
              ) : null}
              <button type="button" className="button" onClick={toggleFullscreen} disabled={!state.moduleReady}>
                {fullscreen ? "Exit full screen" : "Full screen"}
              </button>
            </div>
          </div>
        </section>
        <aside className="panel">
          <p className="lede">
            An experiment. It does not run every game the desktop and mobile builds run. Chrome or Firefox on a cross-origin isolated page can run it. Saves stay in this browser.
          </p>
          <ul className="formats" aria-label="Supported files">
            <li>ISO</li>
            <li>CSO</li>
            <li>CHD</li>
            <li>ISZ</li>
            <li>BIN</li>
            <li>ELF</li>
          </ul>
          <p className="formats-note">No BIOS file required.</p>
          <KeyboardMap />
        </aside>
      </div>
    </div>
  );
}

export default App;

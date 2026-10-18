import './App.css';
import { ChangeEvent, useState, useEffect } from 'react';
import { PlayModule } from './PlayModule';
import { useAppDispatch, useAppSelector, bootFile } from "./Actions";

function Stats() {
  const [stats, setStats] = useState({ fps: 0 });
  useEffect(() => {
    const timer = setInterval(() => {
      if(!PlayModule) {
        return;
      }
      const frames = PlayModule.getFrames();
      PlayModule.clearStats();
      setStats({ fps: frames });
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return (
    <span className="stats">{stats.fps} f/s</span>
  )
}

function focusCanvas() {
  const canvas = document.getElementById("outputCanvas");
  if(canvas instanceof HTMLElement) {
    canvas.focus();
  }
}

function App() {
  const state = useAppSelector((state) => state.play);
  const dispatch = useAppDispatch();
  useEffect(() => {
    if(state.status !== "running") {
      return;
    }
    focusCanvas();
  }, [state.status]);
  const handleChange = function(event : ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files && input.files.length !== 0 ? input.files[0] : null;
    // A second pick of the same path does not fire change unless the value is cleared.
    input.value = "";
    if(file) {
      focusCanvas();
      dispatch(bootFile(file));
    }
  }
  if(!state.moduleReady) {
    return (
      <p className={state.status === "error" ? "status status-error" : "status"} role="status">
        {state.message}
      </p>
    );
  } else {
    return (
      <div>
        <label className="file-picker">
          Disc image or ELF
          <input
            aria-label="Disc image or ELF"
            type="file"
            accept=".iso,.cso,.chd,.isz,.bin,.elf"
            onChange={handleChange}
            disabled={state.status === "booting"}
          />
        </label>
        <p className={state.status === "error" ? "status status-error" : "status"} role="status">
          {state.message}
        </p>
        <Stats />
        <span className="version">
          {`Version: ${process.env.REACT_APP_VERSION || "dev"}`}
        </span>
      </div>
    );
  }
}

export default App;

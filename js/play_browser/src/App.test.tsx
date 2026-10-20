import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import App from './App';
import { createPlayStore, init } from './Actions';
import { PlayModule, initPlayModule } from './PlayModule';

jest.mock('./PlayModule', () => ({
  PlayModule: {
    getFrames: () => 0,
    clearStats: () => {},
    bootElf: jest.fn(),
    bootDiscImage: jest.fn(),
    discImageDevice: { setFile: jest.fn() },
    FS: {
      mkdir: jest.fn(),
      open: jest.fn(() => 1),
      write: jest.fn(),
      close: jest.fn(),
      syncfs: jest.fn((_populate: boolean, callback: (err: null) => void) => callback(null)),
    },
  },
  initPlayModule: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // resetMocks drops the factory implementation before each test.
  PlayModule.FS.syncfs.mockImplementation((_populate: boolean, callback: (err: null) => void) => callback(null));
});

afterEach(() => {
  delete PlayModule.bootReportsResult;
  delete PlayModule.onBootResult;
  delete PlayModule.queryStateSlot;
  delete PlayModule.saveStateSlot;
  delete PlayModule.loadStateSlot;
  delete PlayModule.onStateResult;
  delete PlayModule.FS.readFile;
  delete PlayModule.FS.unlink;
  (PlayModule.bootElf as jest.Mock).mockReset();
  (PlayModule.bootDiscImage as jest.Mock).mockReset();
  (PlayModule.FS.open as jest.Mock).mockImplementation(() => 1);
});

function renderApp() {
  const store = createPlayStore();
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );
  return store;
}

test('shows a loading message until the module is ready', () => {
  renderApp();
  expect(screen.getByRole('status')).toHaveTextContent('Loading emulator...');
  expect(screen.queryByLabelText('Open disc or ELF')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Game picture')).toBeInTheDocument();
  expect(screen.getByText(/Saves stay in this browser/)).toBeInTheDocument();
  expect(screen.getByText(/Download keeps a copy/)).toBeInTheDocument();
});

test('explains when the browser cannot run the emulator', async () => {
  (initPlayModule as jest.Mock).mockRejectedValueOnce(new Error(
    'This browser cannot draw WebGL2 from a worker. Chrome or Firefox can.'
  ));
  const store = renderApp();
  store.dispatch(init());
  expect(await screen.findByText('Cannot run here')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('WebGL2 from a worker');
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});

test('boots an elf from the virtual filesystem', async () => {
  const store = renderApp();
  store.dispatch(init());
  expect(await screen.findByLabelText('Open disc or ELF')).toBeEnabled();

  const file = new File([Uint8Array.from([1, 2, 3, 4])], 'demo.ELF');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(PlayModule.FS.open).toHaveBeenCalledWith('/work/demo.ELF', 'w+');
  expect(PlayModule.bootElf).toHaveBeenCalledWith('/work/demo.ELF');
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
});

test('reports a missing extension instead of marking the boot successful', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const file = new File(['x'], 'noext');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText('File name must have an extension.')).toBeInTheDocument();
  expect(PlayModule.bootElf).not.toHaveBeenCalled();
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
});

test('sends disc images to the disc device', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const file = new File([Uint8Array.from([9, 8, 7])], 'game.iso');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(PlayModule.discImageDevice.setFile).toHaveBeenCalledWith(file);
  expect(PlayModule.bootDiscImage).toHaveBeenCalledWith('game.iso');
});

test('rejects a file type the page does not boot', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const file = new File(['hello'], 'notes.txt');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText('Supported files are ISO, CSO, CHD, ISZ, BIN, and ELF.')).toBeInTheDocument();
  expect(PlayModule.bootElf).not.toHaveBeenCalled();
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
  expect(PlayModule.discImageDevice.setFile).not.toHaveBeenCalled();
});

test('clears the file input so the same file can be chosen again', async () => {
  const store = renderApp();
  store.dispatch(init());
  const input = await screen.findByLabelText('Open disc or ELF') as HTMLInputElement;

  const file = new File([Uint8Array.from([1, 2, 3, 4])], 'demo.elf');
  await userEvent.upload(input, file);

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(input.value).toBe('');
});

test('shows the emulator boot error instead of running', async () => {
  PlayModule.bootReportsResult = () => 1;
  (PlayModule.bootDiscImage as jest.Mock).mockImplementation(() => {
    PlayModule.onBootResult(0, 'No SYSTEM.CNF file found on the cdrom0 device.');
  });

  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const file = new File([Uint8Array.from([9])], 'game.iso');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText('No SYSTEM.CNF file found on the cdrom0 device.')).toBeInTheDocument();
  expect(screen.getByLabelText('Open disc or ELF')).toBeEnabled();
  expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
});

test('keeps a running game up when the next file cannot boot', async () => {
  const store = renderApp();
  await bootIso(store);
  expect(screen.getByText('game.iso')).toBeInTheDocument();

  const notes = new File(['hello'], 'notes.txt');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), notes);

  expect(await screen.findByText('Supported files are ISO, CSO, CHD, ISZ, BIN, and ELF.')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveClass('status-error');
  expect(screen.getByText('game.iso')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
  expect(PlayModule.bootDiscImage).toHaveBeenCalledTimes(1);
});

test('opens a zip dropped on the picture of a running game', async () => {
  const statePath = '/home/web_user/.local/share/Play Data Files/states/game.st0.zip';
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 1, statePath);
  });
  PlayModule.loadStateSlot = jest.fn(() => {
    PlayModule.onStateResult(2, 1, '');
  });

  const store = renderApp();
  await bootIso(store);
  await waitFor(() => expect(screen.getByLabelText('Open save')).toBeEnabled());

  const save = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1])], 'brought.st0.zip');
  fireEvent.drop(screen.getByLabelText('Game picture'), {
    dataTransfer: {
      files: [save],
    },
  });

  expect(await screen.findByText('Loaded.')).toBeInTheDocument();
  expect(PlayModule.loadStateSlot).toHaveBeenCalled();
  expect(PlayModule.bootDiscImage).toHaveBeenCalledTimes(1);
  expect(screen.getByText('game.iso')).toBeInTheDocument();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
});

test('returns to the running game when the next ELF cannot be read', async () => {
  const store = renderApp();
  await bootIso(store);
  (PlayModule.FS.open as jest.Mock).mockImplementation(() => {
    throw new Error('Failed to read ELF.');
  });

  const elf = new File([Uint8Array.from([1, 2, 3, 4])], 'bad.elf');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), elf);

  expect(await screen.findByText('Failed to read ELF.')).toBeInTheDocument();
  expect(screen.getByText('game.iso')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
  expect(screen.queryByText('bad.elf')).not.toBeInTheDocument();
  expect(PlayModule.bootElf).not.toHaveBeenCalled();
});

test('covers the picture when a new disc fails inside the emulator', async () => {
  const store = renderApp();
  await bootIso(store);

  PlayModule.bootReportsResult = () => 1;
  (PlayModule.bootDiscImage as jest.Mock).mockImplementation(() => {
    PlayModule.onBootResult(0, 'No SYSTEM.CNF file found on the cdrom0 device.');
  });
  const file = new File([Uint8Array.from([1])], 'bad.iso');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);

  expect(await screen.findByText('No SYSTEM.CNF file found on the cdrom0 device.')).toBeInTheDocument();
  expect(screen.getByText('Could not start')).toBeInTheDocument();
  expect(screen.getByText('bad.iso')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});

test('boots a disc dropped on the picture', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const file = new File([Uint8Array.from([4, 5])], 'drop.iso');
  fireEvent.drop(screen.getByLabelText('Game picture'), {
    dataTransfer: {
      files: [file],
    },
  });

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(screen.getByText('drop.iso')).toBeInTheDocument();
  expect(PlayModule.bootDiscImage).toHaveBeenCalledWith('drop.iso');
});

test('focuses the picture when entering full screen', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const stage = document.getElementById('stage') as HTMLElement;
  stage.requestFullscreen = jest.fn(() => Promise.resolve());
  await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));

  expect(stage.requestFullscreen).toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByLabelText('Game picture'));
});

async function bootIso(store: ReturnType<typeof createPlayStore>) {
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');
  const file = new File([Uint8Array.from([9])], 'game.iso');
  await userEvent.upload(screen.getByLabelText('Open disc or ELF'), file);
  expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
}

test('saves into this browser and then allows load', async () => {
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 0, '');
  });
  PlayModule.saveStateSlot = jest.fn(() => {
    PlayModule.onStateResult(1, 1, '');
  });
  PlayModule.loadStateSlot = jest.fn(() => {
    PlayModule.onStateResult(2, 1, '');
  });

  const store = renderApp();
  await bootIso(store);
  expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved in this browser.')).toBeInTheDocument();
  expect(PlayModule.saveStateSlot).toHaveBeenCalled();
  expect(PlayModule.FS.syncfs).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();

  await userEvent.click(screen.getByRole('button', { name: 'Load' }));
  expect(await screen.findByText('Loaded.')).toBeInTheDocument();
  expect(PlayModule.loadStateSlot).toHaveBeenCalled();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
});

test('downloads a save and opens one from a file', async () => {
  const statePath = '/home/web_user/.local/share/Play Data Files/states/game.st0.zip';
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 0, statePath);
  });
  PlayModule.saveStateSlot = jest.fn(() => {
    PlayModule.onStateResult(1, 1, statePath);
  });
  PlayModule.loadStateSlot = jest.fn(() => {
    PlayModule.onStateResult(2, 1, '');
  });
  PlayModule.FS.readFile = jest.fn(() => new Uint8Array([9, 8, 7, 6]));
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:save');
  URL.revokeObjectURL = jest.fn();

  const store = renderApp();
  await bootIso(store);
  await waitFor(() => expect(screen.getByLabelText('Open save')).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved in this browser.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();

  await userEvent.click(screen.getByRole('button', { name: 'Download' }));
  expect(await screen.findByText('Downloaded the save.')).toBeInTheDocument();
  expect(PlayModule.FS.readFile).toHaveBeenCalledWith(statePath);

  const save = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2])], 'game.st0.zip');
  await userEvent.upload(screen.getByLabelText('Open save'), save);
  expect(await screen.findByText('Loaded.')).toBeInTheDocument();
  expect(PlayModule.FS.open).toHaveBeenCalledWith(statePath, 'w+');
  expect(PlayModule.FS.write).toHaveBeenCalled();
  expect(PlayModule.loadStateSlot).toHaveBeenCalled();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

test('rejects a file that is not a save and leaves the stored one in place', async () => {
  const statePath = '/home/web_user/.local/share/Play Data Files/states/game.st0.zip';
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 1, statePath);
  });
  PlayModule.loadStateSlot = jest.fn();

  const store = renderApp();
  await bootIso(store);
  await waitFor(() => expect(screen.getByLabelText('Open save')).toBeEnabled());

  const save = new File([Uint8Array.from([1, 2, 3, 4])], 'notes.zip');
  await userEvent.upload(screen.getByLabelText('Open save'), save);

  expect(await screen.findByText('That file is not a Play! save.')).toBeInTheDocument();
  expect(PlayModule.FS.open).not.toHaveBeenCalled();
  expect(PlayModule.loadStateSlot).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();
});

test('puts the previous save back when an opened file does not load', async () => {
  const statePath = '/home/web_user/.local/share/Play Data Files/states/game.st0.zip';
  const previous = new Uint8Array([9, 8, 7, 6]);
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 1, statePath);
  });
  PlayModule.loadStateSlot = jest.fn(() => {
    PlayModule.onStateResult(2, 0, 'Could not load.');
  });
  PlayModule.FS.readFile = jest.fn(() => previous);
  PlayModule.FS.unlink = jest.fn();

  const store = renderApp();
  await bootIso(store);
  await waitFor(() => expect(screen.getByLabelText('Open save')).toBeEnabled());

  const save = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1])], 'bad.st0.zip');
  await userEvent.upload(screen.getByLabelText('Open save'), save);

  expect(await screen.findByText('Could not load.')).toBeInTheDocument();
  expect(PlayModule.FS.unlink).not.toHaveBeenCalled();
  const writes = (PlayModule.FS.write as jest.Mock).mock.calls;
  expect(writes.length).toBe(2);
  expect(Array.from(writes[1][1])).toEqual([9, 8, 7, 6]);
  expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
});

test('keeps the picture up when a save fails', async () => {
  PlayModule.queryStateSlot = jest.fn(() => {
    PlayModule.onStateResult(0, 0, '');
  });
  PlayModule.saveStateSlot = jest.fn(() => {
    PlayModule.onStateResult(1, 0, 'Could not save.');
  });

  const store = renderApp();
  await bootIso(store);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Could not save.')).toBeInTheDocument();
  expect(screen.queryByText('Could not start')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('shows the keyboard bindings next to the picture', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Open disc or ELF');

  const keyboard = screen.getByRole('region', { name: 'Keyboard' });
  expect(keyboard).toHaveTextContent('Cross');
  expect(keyboard).toHaveTextContent('Z');
  expect(keyboard).toHaveTextContent('left, right, up, down');
  expect(screen.getByRole('button', { name: 'Full screen' })).toBeEnabled();
});

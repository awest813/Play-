import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import App from './App';
import { createPlayStore, init } from './Actions';
import { PlayModule } from './PlayModule';

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
    },
  },
  initPlayModule: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  delete PlayModule.bootReportsResult;
  delete PlayModule.onBootResult;
  (PlayModule.bootElf as jest.Mock).mockReset();
  (PlayModule.bootDiscImage as jest.Mock).mockReset();
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
  expect(screen.queryByLabelText('Disc image or ELF')).not.toBeInTheDocument();
});

test('boots an elf from the virtual filesystem', async () => {
  const store = renderApp();
  store.dispatch(init());
  expect(await screen.findByLabelText('Disc image or ELF')).toBeEnabled();

  const file = new File([Uint8Array.from([1, 2, 3, 4])], 'demo.ELF');
  await userEvent.upload(screen.getByLabelText('Disc image or ELF'), file);

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(PlayModule.FS.open).toHaveBeenCalledWith('/work/demo.ELF', 'w+');
  expect(PlayModule.bootElf).toHaveBeenCalledWith('/work/demo.ELF');
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
});

test('reports a missing extension instead of marking the boot successful', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Disc image or ELF');

  const file = new File(['x'], 'noext');
  await userEvent.upload(screen.getByLabelText('Disc image or ELF'), file);

  expect(await screen.findByText('File name must have an extension.')).toBeInTheDocument();
  expect(PlayModule.bootElf).not.toHaveBeenCalled();
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
});

test('sends disc images to the disc device', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Disc image or ELF');

  const file = new File([Uint8Array.from([9, 8, 7])], 'game.iso');
  await userEvent.upload(screen.getByLabelText('Disc image or ELF'), file);

  expect(await screen.findByText(/Running/)).toBeInTheDocument();
  expect(PlayModule.discImageDevice.setFile).toHaveBeenCalledWith(file);
  expect(PlayModule.bootDiscImage).toHaveBeenCalledWith('game.iso');
});

test('rejects a file type the page does not boot', async () => {
  const store = renderApp();
  store.dispatch(init());
  await screen.findByLabelText('Disc image or ELF');

  const file = new File(['hello'], 'notes.txt');
  await userEvent.upload(screen.getByLabelText('Disc image or ELF'), file);

  expect(await screen.findByText('Supported files are ISO, CSO, CHD, ISZ, BIN, and ELF.')).toBeInTheDocument();
  expect(PlayModule.bootElf).not.toHaveBeenCalled();
  expect(PlayModule.bootDiscImage).not.toHaveBeenCalled();
  expect(PlayModule.discImageDevice.setFile).not.toHaveBeenCalled();
});

test('clears the file input so the same file can be chosen again', async () => {
  const store = renderApp();
  store.dispatch(init());
  const input = await screen.findByLabelText('Disc image or ELF') as HTMLInputElement;

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
  await screen.findByLabelText('Disc image or ELF');

  const file = new File([Uint8Array.from([9])], 'game.iso');
  await userEvent.upload(screen.getByLabelText('Disc image or ELF'), file);

  expect(await screen.findByText('No SYSTEM.CNF file found on the cdrom0 device.')).toBeInTheDocument();
  expect(screen.getByLabelText('Disc image or ELF')).toBeEnabled();
  expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
});

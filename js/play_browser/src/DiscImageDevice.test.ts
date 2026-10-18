import DiscImageDevice from './DiscImageDevice';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('read copies the requested slice and then reports completion', async () => {
  const heap = new Uint8Array(8);
  const device = new DiscImageDevice({ HEAPU8: heap });
  const file = new File([Uint8Array.from([9, 8, 7, 6, 5])], 'game.iso');
  device.setFile(file);

  device.read(2, 1, 3);
  expect(device.isDone()).toBe(false);

  await waitUntil(() => device.isDone());

  expect(device.isDone()).toBe(true);
  expect(device.hasError()).toBe(false);
  expect(device.getBytesRead()).toBe(3);
  expect(Array.from(heap.slice(2, 5))).toEqual([8, 7, 6]);
});

test('read finishes with an error when the file read fails', async () => {
  const device = new DiscImageDevice({ HEAPU8: new Uint8Array(4) });
  const pending = deferred<ArrayBuffer>();
  const file = {
    size: 4,
    slice: () => ({ arrayBuffer: () => pending.promise }),
  } as unknown as File;
  device.setFile(file);

  device.read(0, 0, 4);
  pending.reject(new Error('disk stalled'));
  await waitUntil(() => device.isDone());

  expect(device.isDone()).toBe(true);
  expect(device.hasError()).toBe(true);
  expect(device.getError()).toBe('disk stalled');
  expect(device.getBytesRead()).toBe(0);
});

test('read reports a short count at the end of the image', async () => {
  const heap = new Uint8Array(8);
  const device = new DiscImageDevice({ HEAPU8: heap });
  device.setFile(new File([Uint8Array.from([1, 2])], 'short.iso'));

  device.read(0, 0, 8);
  await waitUntil(() => device.isDone());

  expect(device.isDone()).toBe(true);
  expect(device.getBytesRead()).toBe(2);
  expect(Array.from(heap.slice(0, 2))).toEqual([1, 2]);
});

test('read completes immediately when no file is set', () => {
  const device = new DiscImageDevice({ HEAPU8: new Uint8Array(4) });
  device.read(0, 0, 1);
  expect(device.isDone()).toBe(true);
  expect(device.hasError()).toBe(true);
  expect(device.getBytesRead()).toBe(0);
});

test('file size is split into 32-bit halves', () => {
  const device = new DiscImageDevice({});
  const size = 4294967296 + 100;
  const file = { size, slice: () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) } as unknown as File;
  device.setFile(file);
  expect(device.getFileSizeLow()).toBe(100);
  expect(device.getFileSizeHigh()).toBe(1);
});

function waitUntil(predicate: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if(predicate()) {
        clearInterval(timer);
        resolve();
      } else if(Date.now() - startedAt > 1000) {
        clearInterval(timer);
        reject(new Error("timed out waiting for disc read"));
      }
    }, 0);
  });
}

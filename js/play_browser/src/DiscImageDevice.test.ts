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

function sharedHeap() {
  const shared = new SharedArrayBuffer(64);
  return {
    shared,
    heap32: new Int32Array(shared),
    heap8: new Uint8Array(shared),
  };
}

test('read stores the result in the futex slot and wakes it', async () => {
  const { heap32, heap8 } = sharedHeap();
  const device = new DiscImageDevice({ HEAPU8: heap8, HEAP32: heap32 });
  device.setFile(new File([Uint8Array.from([4, 5, 6, 7])], 'game.iso'));
  const flagPtr = 32;

  device.read(0, 1, 3, flagPtr);
  expect(Atomics.load(heap32, flagPtr >> 2)).toBe(0);

  await waitUntil(() => Atomics.load(heap32, flagPtr >> 2) === 1);

  expect(Atomics.load(heap32, (flagPtr >> 2) + 1)).toBe(0);
  expect(Atomics.load(heap32, (flagPtr >> 2) + 2)).toBe(3);
  expect(Array.from(heap8.slice(0, 3))).toEqual([5, 6, 7]);
});

test('a failed read wakes the futex slot with an error', async () => {
  const { heap32, heap8 } = sharedHeap();
  const pending = deferred<ArrayBuffer>();
  const device = new DiscImageDevice({ HEAPU8: heap8, HEAP32: heap32 });
  const file = {
    size: 4,
    slice: () => ({ arrayBuffer: () => pending.promise }),
  } as unknown as File;
  device.setFile(file);
  const flagPtr = 32;

  device.read(0, 0, 4, flagPtr);
  pending.reject(new Error('disk stalled'));
  await waitUntil(() => Atomics.load(heap32, flagPtr >> 2) === 1);

  expect(Atomics.load(heap32, (flagPtr >> 2) + 1)).toBe(1);
  expect(Atomics.load(heap32, (flagPtr >> 2) + 2)).toBe(0);
  expect(device.getError()).toBe('disk stalled');
});

test('a read that was waiting when the file is replaced finishes from its own file', async () => {
  const { heap32, heap8 } = sharedHeap();
  const pending = deferred<ArrayBuffer>();
  const device = new DiscImageDevice({ HEAPU8: heap8, HEAP32: heap32 });
  const file = {
    size: 4,
    slice: () => ({ arrayBuffer: () => pending.promise }),
  } as unknown as File;
  device.setFile(file);
  const flagPtr = 32;

  device.read(0, 0, 4, flagPtr);
  device.setFile(new File([Uint8Array.from([1])], 'other.iso'));
  pending.resolve(Uint8Array.from([4, 3, 2, 1]).buffer);
  await waitUntil(() => Atomics.load(heap32, flagPtr >> 2) === 1);

  // An error here would throw on the emulator thread before the new boot resets it.
  expect(Atomics.load(heap32, (flagPtr >> 2) + 1)).toBe(0);
  expect(Atomics.load(heap32, (flagPtr >> 2) + 2)).toBe(4);
  expect(Array.from(heap8.slice(0, 4))).toEqual([4, 3, 2, 1]);
  expect(device.isDone()).toBe(false);
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

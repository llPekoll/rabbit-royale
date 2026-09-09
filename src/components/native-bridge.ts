'use client';

/**
 * Adapts the native Android bridge to the same shape a browser wallet has.
 *
 * The Kotlin side (`AndroidWallet`) is callback-driven — it cannot return a
 * promise across the JS bridge, so it resolves globals (`__mwaResolve`). This
 * module wraps that into the `connect()` / `signMessage()` interface the login
 * hook already speaks, so ONE code path serves the Seeker and the desktop.
 */

interface AndroidWallet {
  getAddress(): void;
  signIn(message: string): void;
  getFcmToken(): void;
  isAvailable(): boolean;
}

declare global {
  interface Window {
    AndroidWallet?: AndroidWallet;
    __mwaResolve?: (r: { address: string; signature: string }) => void;
    __mwaReject?: (e: string) => void;
    __fcmResolve?: (t: string) => void;
    __fcmReject?: (e: string) => void;
  }
}

/** Are we inside the native shell? */
export const isNative = () =>
  typeof window !== 'undefined' && window.AndroidWallet?.isAvailable() === true;

/** One in-flight native call at a time — the bridge has a single callback slot. */
function once<T>(start: () => void, install: (resolve: (v: T) => void, reject: (e: Error) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    install(resolve, reject);
    start();
  });
}

function mwa(start: () => void) {
  return once<{ address: string; signature: string }>(start, (resolve, reject) => {
    window.__mwaResolve = (r) => { cleanup(); resolve(r); };
    window.__mwaReject = (e) => { cleanup(); reject(new Error(e)); };
    const cleanup = () => { delete window.__mwaResolve; delete window.__mwaReject; };
  });
}

/**
 * The native wallet, presented exactly like an injected browser wallet.
 *
 * `signMessage` ignores the bytes it is handed and passes the ORIGINAL string
 * to Kotlin: the bridge re-encodes it as UTF-8 itself, and round-tripping the
 * bytes back through a JS string would corrupt any non-ASCII character.
 */
export function nativeWallet() {
  let lastMessage = '';
  return {
    async connect() {
      const { address } = await mwa(() => window.AndroidWallet!.getAddress());
      return { publicKey: { toString: () => address } };
    },
    setMessage(message: string) { lastMessage = message; },
    async signMessage() {
      const { signature } = await mwa(() => window.AndroidWallet!.signIn(lastMessage));
      // The hook base58-encodes what it gets back; the bridge already returned
      // base58, so it is handed through as a marker the hook understands.
      return { signature, alreadyBase58: true as const };
    },
  };
}

/** This device's FCM token, or null outside the native shell. */
export function fcmToken(): Promise<string | null> {
  if (!isNative()) return Promise.resolve(null);
  return once<string | null>(() => window.AndroidWallet!.getFcmToken(), (resolve) => {
    window.__fcmResolve = (t) => { cleanup(); resolve(t); };
    window.__fcmReject = () => { cleanup(); resolve(null); };
    const cleanup = () => { delete window.__fcmResolve; delete window.__fcmReject; };
  });
}

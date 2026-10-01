// Catch Chromium's `beforeinstallprompt` before the app bundle runs.
//
// The event fires ONCE, about 1.5 s after navigation. The module that turns it
// into the INSTALL popup (src/components/install-guide.tsx) ships in an app
// chunk, which on a slow connection lands later than that — miss the event and
// INSTALL can only ever show written steps. layout.tsx loads this file with
// next/script `beforeInteractive`, ahead of every app chunk; the module reads
// `window.__rrInstallPrompt` at load and takes over. One statement: nothing
// here may depend on anything else on the page. (Same file as the Domin8 hub's.)
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault(); // keep Chromium's own mini-infobar out of the way
  window.__rrInstallPrompt = e;
});

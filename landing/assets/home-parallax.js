// The same six registered planes as Godot's home_background.tscn.
// Keep Shiro and Kuro at terrain depth so their feet never slide.
(() => {
  const revision = 'shiro-kuro-20261001';
  const planes = [[1, .08], [2, .18], [3, .38], [4, .65], [6, 1], [5, .65]];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const scene = scenes.find(s => s.root === entry.target);
      if (scene) scene.visible = entry.isIntersecting;
    }
  });
  function register(root) {
    const scene = { root, visible: false, layers: [...root.querySelectorAll('[data-depth]')] };
    scenes.push(scene);
    observer.observe(root);
  }
  document.querySelectorAll('[data-home-parallax]').forEach(register);

  // Keep the flat illustration as a no-JS / failed-download fallback.
  // Decode all planes before swapping it, avoiding partially loaded scenery.
  const backgrounds = [...document.querySelectorAll('img[data-home-background]')];
  if (backgrounds.length) {
    const images = planes.map(([file, depth]) => {
      const image = new Image();
      image.src = `/assets/l${file}.webp?v=${revision}`;
      image.alt = '';
      image.dataset.depth = depth;
      image.style.cssText = 'position:absolute;inset:-3%;width:106%;height:106%;object-fit:cover;image-rendering:pixelated;pointer-events:none';
      return image;
    });
    Promise.all(images.map(image => image.decode())).then(() => {
      for (const background of backgrounds) {
        const root = document.createElement('div');
        root.style.cssText = background.style.cssText;
        root.style.overflow = 'hidden';
        root.style.pointerEvents = 'none';
        root.className = background.className;
        root.dataset.homeParallax = '';
        root.setAttribute('aria-hidden', 'true');
        if (!root.style.position) root.style.position = 'absolute';
        if (!root.style.width) root.style.width = '100%';
        if (!root.style.height) root.style.height = '100%';
        images.forEach(image => root.append(image.cloneNode()));
        background.replaceWith(root);
        register(root);
      }
    }).catch(() => { /* The flat Shiro/Kuro image remains visible. */ });
  }

  let tx = 0, ty = 0, x = 0, y = 0, last = 0, tilted = false;
  addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    tx = (event.clientX / innerWidth - .5) * 2;
    ty = (event.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  addEventListener('deviceorientation', event => {
    if (event.gamma == null || event.beta == null) return;
    // A phone that reports its tilt drives the scene alone: no idle drift.
    tilted = true;
    tx = Math.max(-1, Math.min(1, event.gamma / 25));
    ty = Math.max(-1, Math.min(1, (event.beta - 45) / 25));
  }, { passive: true });
  function frame(now) {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    if (!document.hidden) {
      const blend = 1 - Math.exp(-3 * dt);
      const seconds = now / 1000;
      const drift = tilted ? 0 : 1;
      x += (tx + Math.sin(seconds * .35) * .5 * drift - x) * blend;
      y += (ty + Math.sin(seconds * .23) * .35 * drift - y) * blend;
      for (const scene of scenes) {
        if (!scene.visible || scene.root.closest('.slide:not(.on)')) continue;
        for (const layer of scene.layers) {
          const depth = +layer.dataset.depth;
          layer.style.transform = reduced.matches ? 'none' :
            `translate3d(${(-x * depth * 1.2).toFixed(3)}%, ${(-y * depth * .9).toFixed(3)}%, 0)`;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

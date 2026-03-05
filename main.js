document.addEventListener("DOMContentLoaded", function() {
    const splash = document.getElementById("splash-screen");
    const main = document.getElementById("main-content");
    const startBtn = document.getElementById("startBtn");

    function showMain() {
        if (splash) splash.classList.add('splash-hidden');
        if (main) main.classList.remove('hidden');
        const mapContainer = document.querySelector('.map-container');
        if (mapContainer) mapContainer.focus();
    // start Lolly movement when main content is shown
    if (window.startLolly) window.startLolly();
    }

    if (startBtn) {
        startBtn.addEventListener('click', showMain);
        // support keyboard activation
        startBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showMain();
            }
        });
        // fallback image: if assets/zoom_in.png doesn't exist, replace with inline SVG
        const startImg = document.getElementById('startIcon');
        if (startImg) {
            startImg.addEventListener('error', () => {
                // simple inline SVG magnifying glass (+)
                const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="27" cy="27" r="14" stroke="white" stroke-width="4" fill="none"/><line x1="36" y1="36" x2="54" y2="54" stroke="white" stroke-width="4" stroke-linecap="round"/><line x1="24" y1="20" x2="24" y2="34" stroke="white" stroke-width="3" stroke-linecap="round"/><line x1="18" y1="27" x2="30" y2="27" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>');
                startImg.src = 'data:image/svg+xml;utf8,' + svg;
            });
        }
    }
    
    // Activate Start when pressing 'A' or 'a' while splash is visible
    document.addEventListener('keydown', (e) => {
        if (!splash) return;
        if (splash.classList.contains('splash-hidden')) return; // already hidden
        if (e.key === 'a' || e.key === 'A') {
            showMain();
        }
    });
});

//LOLLY ANIMATION (NOT WORKING!!)

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.map-container');
  const spriteEl = document.getElementById('lolly');          // div for sprite-sheet
  const gifWalk = document.getElementById('lolly-walk');      // existing GIF walking
  const gifIdle = document.getElementById('lolly-idle');      // existing idle GIF
  if (!container) return;

  // config
  const speed = 60; // px/sec
  const startOffset = 100; // px beyond right edge

  // path configuration (user-specified)
  const pathStartLeft = 1100; // px where Lolly starts walking (updated)
  const pathStartTop = 200;    // px start top (updated)
  const pathMidTop = 300;     // px top at halfway (creates the U shape)

  // deterministic cycle for idle windows (ms)
  const cycleMs = 8250; // 8.25s
  const idleRanges = [
    [0, 1000],
    [3000, 5250],
    [6250, 8250]
  ];

  // sprite settings (will be filled if sprite loads)
  const spriteSrc = 'assets/lolly-sprite.png';
  let useSprite = false;
  let spriteFrameCount = 8;
  let spriteFrameWidth = 0;
  let spriteFrameHeight = 0;
  let spriteLoaded = false;

  // attempt to load sprite sheet silently
  const probe = new Image();
  probe.src = spriteSrc;
  probe.onload = () => {
    spriteLoaded = true;
    useSprite = true;
    spriteFrameWidth = probe.naturalWidth / spriteFrameCount;
    spriteFrameHeight = probe.naturalHeight;
    // set background-size to source size (no scaling) so background-position math matches
    if (spriteEl) {
      spriteEl.style.backgroundSize = `${probe.naturalWidth}px ${probe.naturalHeight}px`;
    }
    // hide GIF fallbacks if present
    if (gifWalk) gifWalk.style.display = 'none';
    if (gifIdle) gifIdle.style.display = 'none';
  };
  probe.onerror = () => {
    useSprite = false;
    // ensure GIF fallbacks are visible if sprite not available
    if (gifWalk) gifWalk.style.display = 'block';
    if (gifIdle) gifIdle.style.display = 'none';
  };

  // If user provided new GIF files (lolly_walk / lolly_idle), prefer them.
  // Try a list of candidate filenames and use the first that loads.
  function resolveFirstImage(candidates, el, cb) {
    if (!el) return cb && cb(null);
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) return cb && cb(null);
      const src = candidates[i++];
      const img = new Image();
      img.onload = () => { el.src = src; cb && cb(src); };
      img.onerror = tryNext;
      img.src = src;
    }
    tryNext();
  }

  // candidate names (common variants)
  const walkCandidates = [
    'assets/lolly_walk.gif',
    'assets/lolly-walk.gif',
    'assets/lollywalk.gif',
    'assets/lolly.gif'
  ];
  const idleCandidates = [
    'assets/lolly_idle.gif',
    'assets/lolly-idle.gif',
    'assets/lollyidle.gif',
    'assets/lolly-stand.gif'
  ];

  resolveFirstImage(walkCandidates, gifWalk, (src) => {
    // if none found, gifWalk keeps its original src
  });
  resolveFirstImage(idleCandidates, gifIdle, (src) => {
    if (!src && gifIdle) {
      // ensure idle hidden if not provided
      gifIdle.style.display = 'none';
    }
  });

  // state
  let left = (container.clientWidth || 800) + startOffset;
  let last = performance.now();
  let rafId = null;
  let startTime = performance.now();
  let spriteAcc = 0;
  let spriteFps = 30; // match GIF framerate
  let frameDuration = 1000 / spriteFps;
  // walking frames requested: Photoshop frames 1-3 and 5-6 -> zero-based [0,1,2,4,5]
  const walkingFrames = [0, 1, 2, 4, 5];
  const idleFrame = 3; // zero-based frame to show while idle
  let walkingFrameIndex = 0;

  // path runtime state
  let onPath = false;
  let pathStartTime = 0;
  let pathDurationMs = 0;
  let pathElapsedMs = 0; // advances only when not paused
  let pathPaused = false;
  let pauseUntil = 0; // absolute timestamp (performance.now()+ms) when pause ends
  // stops along the path: t (0..1) and duration ms (3/8 and 6/8 requested)
  const pathStops = [
    { t: 3/8, duration: 4000 },
    { t: 6/8, duration: 4000 }
  ];
  // disappearance point requested by user
  const pathEndLeft = 300; // px where Lolly should disappear
  const pathEndTop = 180;  // px where Lolly should disappear

  // player cabana target: when Lolly reaches this X (relative to container)
  const cabanaEl = document.getElementById('cabana');
  let cabanaTargetX = null; // computed later once layout is stable
  let hasEntered = false; // whether Lolly already entered the cabana

  function inIdle(now) {
    const t = (now - startTime) % cycleMs;
    for (let r of idleRanges) if (t >= r[0] && t < r[1]) return true;
    return false;
  }

  function setSpriteFrameIndex(srcIndex) {
    if (!spriteEl) return;
    const sx = -Math.round(srcIndex * spriteFrameWidth);
    spriteEl.style.backgroundPosition = `${sx}px 0`;
  }

  function computeCabanaTarget() {
    if (!cabanaEl || !container) return null;
    // cabana left is in px because it is absolutely positioned inside container
    const style = window.getComputedStyle(cabanaEl);
    const leftStr = style.left || cabanaEl.style.left || '0px';
    const cabLeft = parseFloat(leftStr) || 0;
    const cabWidth = cabanaEl.offsetWidth || 0;
    // choose a point near the cabana door (approx center)
    const target = cabLeft + Math.round(cabWidth * 0.5);
    return target;
  }

  function enterCabana() {
    if (hasEntered) return;
    hasEntered = true;
    // compute final target and center cabana in view
    cabanaTargetX = computeCabanaTarget();
    if (cabanaTargetX == null) {
      // fallback: just hide Lolly
      if (spriteEl) spriteEl.style.display = 'none';
      if (gifWalk) gifWalk.style.display = 'none';
      if (gifIdle) gifIdle.style.display = 'none';
      return;
    }
    // animate Lolly to the target without abruptly jumping the camera.
    // We'll move Lolly diagonally (slight up movement) and then fade her away
    // behind the cabana so she appears to enter.
    const finishMs = 700;
    const el = useSprite && spriteLoaded ? spriteEl : (gifWalk || gifIdle);
    if (!el) return;

  // final exact coordinates requested by user (disappear point)
  const finalLeft = 300; // px
  const finalTop = 180; // px

    // place Lolly behind the cabana visually so she disappears "into" it
    const cabZ = parseInt(window.getComputedStyle(cabanaEl).zIndex || '2', 10) || 2;
    try { el.style.zIndex = String(Math.max(0, cabZ - 1)); } catch (e) {}

    // first animate position (left + top)
    el.style.transition = `left ${finishMs}ms linear, top ${finishMs}ms linear`;
    el.style.left = finalLeft + 'px';
    el.style.top = finalTop + 'px';

    // start fade slightly earlier so she disappears promptly when reaching the cabana
    const fadeStartOffset = Math.min(250, Math.floor(finishMs * 0.4));
    const fadeDuration = 200;
    setTimeout(() => {
      el.style.transition = `opacity ${fadeDuration}ms linear`;
      el.style.opacity = '0';
    }, Math.max(0, finishMs - fadeStartOffset));

    // hide a bit after fade completes
    setTimeout(() => {
      if (useSprite && spriteEl) spriteEl.style.display = 'none';
      if (gifWalk) gifWalk.style.display = 'none';
      if (gifIdle) gifIdle.style.display = 'none';
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }, finishMs + fadeDuration + 50);
  }

  function step(now) {
    const dtMs = Math.min(now - last, 200);
    const dt = dtMs / 1000;
    last = now;

    const idle = inIdle(now);
    // Movement: if we're already on the scripted path, follow the bezier U-shape
    if (!onPath) {
      // start the path movement when animation begins (we position Lolly at pathStart)
      onPath = true;
      pathStartTime = now;
      // duration based on horizontal distance and speed
      pathDurationMs = Math.max(200, Math.abs(pathStartLeft - pathEndLeft) / speed * 1000);
      left = pathStartLeft; // start X
      // set initial element positions
  if (spriteEl) { spriteEl.style.left = pathStartLeft + 'px'; spriteEl.style.top = pathStartTop + 'px'; spriteEl.style.opacity = '1'; spriteEl.style.display = 'block'; }
  if (gifWalk) { gifWalk.style.left = pathStartLeft + 'px'; gifWalk.style.top = pathStartTop + 'px'; gifWalk.style.opacity = '1'; gifWalk.style.display = 'block'; }
  if (gifIdle) { gifIdle.style.left = pathStartLeft + 'px'; gifIdle.style.top = pathStartTop + 'px'; gifIdle.style.opacity = '1'; gifIdle.style.display = 'none'; }
    }

    // advance pathElapsedMs only when not paused
    const prevElapsed = pathElapsedMs;
    if (pathPaused) {
      if (now >= pauseUntil) {
        pathPaused = false;
      }
    } else {
      pathElapsedMs += dtMs;
    }

    // parameter t along path [0..1]
    const t = Math.min(1, Math.max(0, pathElapsedMs / pathDurationMs));

    // check for upcoming stops and trigger pause when passing the trigger point
    if (!pathPaused && t < 1) {
      for (const stop of pathStops) {
        const stopMs = stop.t * pathDurationMs;
        if (prevElapsed < stopMs && pathElapsedMs >= stopMs) {
          // start pause (use absolute timestamp)
          pathPaused = true;
          pauseUntil = now + stop.duration;
          // show idle during pause
          if (useSprite && spriteLoaded) {
            setSpriteFrameIndex(idleFrame);
          } else if (gifWalk && gifIdle) {
            gifWalk.style.display = 'none';
            gifIdle.style.display = 'block';
            gifIdle.style.opacity = '1';
          }
          break;
        }
      }
    }

    // During path movement, determine whether we're effectively idle (paused) or follow global idle schedule
    const effectiveIdle = pathPaused ? true : (onPath && t < 1 ? false : inIdle(now));

    // compute quadratic bezier control point so that at t=0.5 the Y equals pathMidTop
    // For quadratic bezier B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2 => P1 = (4*B(0.5) - P0 - P2)/2
    const P0x = pathStartLeft, P0y = pathStartTop;
    const P2x = pathEndLeft, P2y = pathEndTop;
    const midY = pathMidTop;
    const P1y = (4 * midY - P0y - P2y) / 2;
    const P1x = (P0x + P2x) / 2; // simple horizontal control

    // quadratic bezier interpolation
    const u = 1 - t;
    const bx = (u * u * P0x) + (2 * u * t * P1x) + (t * t * P2x);
    const by = (u * u * P0y) + (2 * u * t * P1y) + (t * t * P2y);

    // update sprite/GIF positions
    if (useSprite && spriteLoaded && spriteFrameWidth > 0) {
      // advance sprite frame while moving (not idle)
      if (!effectiveIdle) {
        spriteAcc += dtMs;
        while (spriteAcc >= frameDuration) {
          spriteAcc -= frameDuration;
          walkingFrameIndex = (walkingFrameIndex + 1) % walkingFrames.length;
        }
        setSpriteFrameIndex(walkingFrames[walkingFrameIndex]);
      } else {
        walkingFrameIndex = 0;
        spriteAcc = 0;
        setSpriteFrameIndex(idleFrame);
      }
      if (spriteEl) { spriteEl.style.left = Math.round(bx) + 'px'; spriteEl.style.top = Math.round(by) + 'px'; }
    } else {
      // GIF fallback
      if (gifWalk) { gifWalk.style.left = Math.round(bx) + 'px'; gifWalk.style.top = Math.round(by) + 'px'; }
      if (gifIdle) { gifIdle.style.left = Math.round(bx) + 'px'; gifIdle.style.top = Math.round(by) + 'px'; }
      if (gifWalk && gifIdle) {
        if (effectiveIdle) {
          gifWalk.style.display = 'none';
          gifIdle.style.display = 'block';
          gifIdle.style.opacity = '1';
        } else {
          gifWalk.style.display = 'block';
          gifWalk.style.opacity = '1';
          gifIdle.style.display = 'none';
        }
      }
    }

    // trigger enter when path completes
    if (t >= 1 && !hasEntered) {
      enterCabana();
    }

    // keep `left` in sync with the current bezier x so legacy checks and resets
    // that reference `left` remain valid
    left = Math.round(bx);

    // reset when off-left
    if (left < -300) {
      left = (container.clientWidth || 800) + startOffset;
      // reset frame index
      walkingFrameIndex = 0;
      spriteAcc = 0;
    }

    rafId = requestAnimationFrame(step);
  }

  // export start function to global so showMain can call it
  window.startLolly = function() {
    if (rafId) return; // already running
    // initialize path immediately so Lolly is visible at the start
    onPath = true;
    pathStartTime = performance.now();
    pathElapsedMs = 0;
    pathPaused = false;
    pathDurationMs = Math.max(200, Math.abs(pathStartLeft - pathEndLeft) / speed * 1000);
    left = pathStartLeft;
    if (spriteEl) { spriteEl.style.left = pathStartLeft + 'px'; spriteEl.style.top = pathStartTop + 'px'; spriteEl.style.opacity = '1'; spriteEl.style.display = 'block'; }
    if (gifWalk) { gifWalk.style.left = pathStartLeft + 'px'; gifWalk.style.top = pathStartTop + 'px'; gifWalk.style.opacity = '1'; gifWalk.style.display = 'block'; }
    if (gifIdle) { gifIdle.style.left = pathStartLeft + 'px'; gifIdle.style.top = pathStartTop + 'px'; gifIdle.style.opacity = '1'; gifIdle.style.display = 'none'; }
    startTime = performance.now();
    last = performance.now();
    rafId = requestAnimationFrame(step);
  };
});

// ISLANDER CABANA

document.addEventListener("DOMContentLoaded", () => {
  const cabana = document.getElementById("islander-cabana");
  const modal = document.getElementById("cabana-modal");
  const closeBtn = document.querySelector(".cabana-close");

  if (!cabana || !modal || !closeBtn) return;

  // Open popup
  cabana.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  // Close button
  closeBtn.addEventListener("click", closeModal);

  // Click background to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // ESC key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

// CABANA

document.addEventListener("DOMContentLoaded", () => {
  const cabana = document.getElementById("cabana"); // PLAYER cabana
  const modal = document.getElementById("player-cabana-modal");
  const closeBtn = modal.querySelector(".cabana-close");

  if (!cabana || !modal || !closeBtn) return;

  // Open popup
  cabana.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  // Close button
  closeBtn.addEventListener("click", closeModal);

  // Click background to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // ESC key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const flagpole = document.getElementById("flagpole");
  const modal = document.getElementById("flagpole-modal");
  const closeBtn = modal.querySelector(".cabana-close");

  if (!flagpole || !modal || !closeBtn) return;

  // Open popup
  flagpole.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  // Close button
  closeBtn.addEventListener("click", closeModal);

  // Click background to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // ESC key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});



document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("toolbox");
  const modal = document.getElementById("toolbox-modal");
  const closeBtn = modal?.querySelector(".cabana-close");

  if (!trigger || !modal || !closeBtn) return;

  trigger.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const sound = document.getElementById("bells-sound");
    if (sound) {
      sound.currentTime = 0;
      sound.play();
    }
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("gyroid");
  const modal = document.getElementById("gyroid-modal");
  const closeBtn = modal?.querySelector(".cabana-close");

  if (!trigger || !modal || !closeBtn) return;

  trigger.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("coral");
  const modal = document.getElementById("coral-modal");
  const closeBtn = modal?.querySelector(".cabana-close");

  if (!trigger || !modal || !closeBtn) return;

  trigger.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("item-box");
  const modal = document.getElementById("bells-modal");
  const closeBtn = modal?.querySelector(".cabana-close");

  if (!trigger || !modal || !closeBtn) return;

  trigger.addEventListener("click", () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
});

// AUDIOOOOOO

// cabana
document.getElementById('islander-cabana').addEventListener('click', function() {
  document.getElementById('cabana-open').currentTime = 0;
  document.getElementById('cabana-open').play();
});
document.getElementById('cabana').addEventListener('click', function() {
  document.getElementById('cabana-open').currentTime = 0;
  document.getElementById('cabana-open').play();
});

// player cabana
document.querySelector('#cabana-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('cabana-close').currentTime = 0;
  document.getElementById('cabana-close').play();
});
document.querySelector('#player-cabana-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('cabana-close').currentTime = 0;
  document.getElementById('cabana-close').play();
});

document.getElementById('cabana-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    document.getElementById('cabana-close').currentTime = 0;
    document.getElementById('cabana-close').play();
  }
});

document.getElementById('player-cabana-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    document.getElementById('cabana-close').currentTime = 0;
    document.getElementById('cabana-close').play();
  }
});

// Example for bells
document.querySelector('#bells-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('bell-close').currentTime = 0;
  document.getElementById('bell-close').play();
});

document.getElementById('bells-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    document.getElementById('bell-close').currentTime = 0;
    document.getElementById('bell-close').play();
  }
});



// Example for coral
document.querySelector('#coral-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('coral-close').currentTime = 0;
  document.getElementById('coral-close').play();
});

  document.getElementById('coral-modal').addEventListener('click', function(e) {
    if (e.target === this) {
    document.getElementById('coral-close').currentTime = 0;
    document.getElementById('coral-close').play();
  }
});


// Example for gyroid
document.querySelector('#gyroid-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('gyroid-close').currentTime = 0;
  document.getElementById('gyroid-close').play();
});
  document.getElementById('gyroid-modal').addEventListener('click', function(e) {
    if (e.target === this) {
    document.getElementById('gyroid-close').currentTime = 0;
    document.getElementById('gyroid-close').play();
  }
});

// Example for toolbox
document.querySelector('#toolbox-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('toolbox-close').currentTime = 0;
  document.getElementById('toolbox-close').play();
});
  document.getElementById('toolbox-modal').addEventListener('click', function(e) {
    if (e.target === this) {
    document.getElementById('toolbox-close').currentTime = 0;
    document.getElementById('toolbox-close').play();
  }
});

// Example for flagpole
document.querySelector('#flagpole-modal .cabana-close').addEventListener('click', function() {
  document.getElementById('flagpole-close').currentTime = 0;
  document.getElementById('flagpole-close').play();
});

document.getElementById('flagpole-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    document.getElementById('flagpole-close').currentTime = 0;
    document.getElementById('flagpole-close').play();
  }
});

// Play open sound on icon/button click (not modal click)
// BELLS
var bells = document.getElementById('item-box');
if (bells) {
  bells.addEventListener('click', function() {
    var audio = document.getElementById('bell-open');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}
// CORAL
var coral = document.getElementById('coral');
if (coral) {
  coral.addEventListener('click', function() {
    var audio = document.getElementById('coral-open');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}
// GYROID
var gyroid = document.getElementById('gyroid');
if (gyroid) {
  gyroid.addEventListener('click', function() {
    var audio = document.getElementById('gyroid-open');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}
// TOOLBOX
var toolbox = document.getElementById('toolbox');
if (toolbox) {
  toolbox.addEventListener('click', function() {
    var audio = document.getElementById('toolbox-open');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}
// FLAGPOLE
var flagpole = document.getElementById('flagpole');
if (flagpole) {
  flagpole.addEventListener('click', function() {
    var audio = document.getElementById('flagpole-open');
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  });
}
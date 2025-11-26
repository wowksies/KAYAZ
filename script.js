document.addEventListener('DOMContentLoaded', function() {
  const userId = "747411610389446747";
  const apiUrl = `https://lanyard.rest/v1/users/${userId}`;

  // Music control logic
  const musicBtn = document.getElementById('music-toggle');
  const musicIcon = document.getElementById('music-icon');
  const bgMusic = document.getElementById('bg-music');
  const musicVolume = document.getElementById('music-volume');
  const musicCompartment = document.querySelector('.music-volume-compartment');
  let musicOn = true;
  let hideCompartmentTimeout = null;

  // Prevent skew on slider drag
  if (musicBtn && musicVolume) {
    musicVolume.addEventListener('mousedown', function() {
      musicBtn.classList.add('noactive');
    });
    musicVolume.addEventListener('touchstart', function() {
      musicBtn.classList.add('noactive');
    });
    document.addEventListener('mouseup', function() {
      musicBtn.classList.remove('noactive');
    });
    document.addEventListener('touchend', function() {
      musicBtn.classList.remove('noactive');
    });
  }

  // Volume compartment hover logic
  function showCompartment() {
    if (musicCompartment) {
      musicCompartment.style.opacity = '1';
      musicCompartment.style.pointerEvents = 'auto';
      musicCompartment.style.transform = 'translateY(-50%) scaleX(1)';
    }
    if (hideCompartmentTimeout) {
      clearTimeout(hideCompartmentTimeout);
      hideCompartmentTimeout = null;
    }
  }
  function hideCompartment() {
    if (hideCompartmentTimeout) clearTimeout(hideCompartmentTimeout);
    hideCompartmentTimeout = setTimeout(() => {
      if (musicCompartment) {
        musicCompartment.style.opacity = '';
        musicCompartment.style.pointerEvents = '';
        musicCompartment.style.transform = '';
      }
    }, 1000);
  }
  if (musicBtn && musicCompartment) {
    musicBtn.addEventListener('mouseenter', showCompartment);
    musicBtn.addEventListener('mouseleave', hideCompartment);
    musicCompartment.addEventListener('mouseenter', showCompartment);
    musicCompartment.addEventListener('mouseleave', hideCompartment);
  }

  // Enter overlay logic
  const enterOverlay = document.getElementById('enter-overlay');
  const enterBtn = document.getElementById('enter-btn');
  if (enterOverlay && enterBtn) {
    // Pause music until user enters
    if (bgMusic) bgMusic.pause();
    // Hide overlay and start music on click
    enterBtn.addEventListener('click', function() {
      enterOverlay.classList.add('hide');
      setTimeout(() => {
        enterOverlay.style.display = 'none';
      }, 700);
      if (bgMusic && musicOn) {
        bgMusic.play();
      }
    });
  }

  function updateMusicBtn() {
    if (musicOn) {
      musicBtn.classList.add('on');
      musicBtn.classList.remove('off');
      musicIcon.textContent = '\uD83C\uDFB5'; // 🎵
    } else {
      musicBtn.classList.remove('on');
      musicBtn.classList.add('off');
      musicIcon.textContent = '\uD83C\uDFB5'; // 🎵
    }
  }

  if (musicBtn && bgMusic) {
    updateMusicBtn();
    bgMusic.volume = musicVolume ? parseFloat(musicVolume.value) : 0.5;
    if (musicVolume) {
      musicVolume.value = bgMusic.volume;
      musicVolume.addEventListener('input', function(e) {
        bgMusic.volume = parseFloat(this.value);
        // Prevent toggling animation if adjusting volume
        e.stopPropagation();
      });
      // Prevent mousedown/touchstart on slider from triggering button animation
      musicVolume.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      musicVolume.addEventListener('touchstart', function(e) { e.stopPropagation(); });
    }
    musicBtn.addEventListener('click', function(e) {
      // Don't toggle music or animate if clicking the slider
      if (e.target === musicVolume) return;
      musicOn = !musicOn;
      if (musicOn) {
        bgMusic.play();
      } else {
        bgMusic.pause();
      }
      musicBtn.classList.add('toggling');
      setTimeout(() => musicBtn.classList.remove('toggling'), 250);
      updateMusicBtn();
    });
  }

  fetch(apiUrl)
    .then(res => res.json())
    .then(({ data }) => {
      // Profile Picture
      const avatarUrl = `https://cdn.discordapp.com/avatars/${data.discord_user.id}/${data.discord_user.avatar}.png`;
      const discordPfp = document.getElementById('discord-pfp');
      if (discordPfp) discordPfp.src = avatarUrl;

      // Username
      const usernameElem = document.getElementById('username');
      if (usernameElem) usernameElem.textContent = data.discord_user.username;
      const statusUsernameElem = document.getElementById('status-username');
      if (statusUsernameElem) statusUsernameElem.textContent = data.discord_user.username;

      // Status Icon and Text
      const statusIcon = document.getElementById('status-icon');
      const statusTextElem = document.getElementById('status-text');
      let activityText = "currently doing nothing";
      let iconUrl = "bored.png"; // Default to bored image
      let spinning = false;

      if (data.activities && data.activities.length > 0) {
        // Spotify (type 2)
        const spotify = data.activities.find(act => act.type === 2);
        if (spotify) {
          activityText = `Listening to ${spotify.details} by ${spotify.state}`;
          iconUrl = spotify.assets && spotify.assets.large_image
            ? `https://i.scdn.co/image/${spotify.assets.large_image.replace("spotify:", "")}`
            : avatarUrl;
          spinning = true;
        } else {
          // Game or other activity
          const game = data.activities.find(act => act.type === 0 || act.type === 4);
          if (game) {
            activityText = `Playing ${game.name}`;
            if (game.assets && game.assets.large_image) {
              iconUrl = `https://cdn.discordapp.com/app-assets/${game.application_id}/${game.assets.large_image}.png`;
            } else {
              iconUrl = avatarUrl;
            }
            spinning = true;
          }
        }
      }

      if (statusIcon) {
        statusIcon.src = iconUrl;
        statusIcon.classList.toggle('spin', spinning);
      }
      if (statusTextElem) statusTextElem.textContent = activityText;
    })
    .catch((err) => {
      const statusTextElem = document.getElementById('status-text');
      if (statusTextElem) statusTextElem.textContent = "Could not fetch Discord data.";
    });

  // 3D hover effect for profile picture
  const pfp3d = document.getElementById('pfp-3d');
  if (pfp3d) {
    pfp3d.addEventListener('mousemove', (e) => {
      const rect = pfp3d.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * 10;
      const rotateY = ((x - centerX) / centerX) * 10;
      pfp3d.style.transform = `rotateX(${-rotateX}deg) rotateY(${rotateY}deg)`;
      pfp3d.classList.add('tilt');
    });
    pfp3d.addEventListener('mouseleave', () => {
      pfp3d.style.transform = '';
      pfp3d.classList.remove('tilt');
    });
  }

  // Side panel toggle logic
  const sideArrow = document.getElementById('side-arrow');
  const sidePanel = document.getElementById('side-panel');
  if (sideArrow && sidePanel) {
    sideArrow.addEventListener('click', () => {
      sidePanel.classList.toggle('active');
    });
  }
});

// --- Interactive Particle Background using OGL ---
(function() {
  if (!window.OGL) return; // OGL must be loaded

  const defaultColors = ["#ffffff", "#ffffff", "#ffffff"];
  const hexToRgb = (hex) => {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const int = parseInt(hex, 16);
    const r = ((int >> 16) & 255) / 255;
    const g = ((int >> 8) & 255) / 255;
    const b = (int & 255) / 255;
    return [r, g, b];
  };

  const vertex = `
    attribute vec3 position;
    attribute vec4 random;
    attribute vec3 color;
    uniform mat4 modelMatrix;
    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;
    uniform float uTime;
    uniform float uSpread;
    uniform float uBaseSize;
    uniform float uSizeRandomness;
    varying vec4 vRandom;
    varying vec3 vColor;
    void main() {
      vRandom = random;
      vColor = color;
      vec3 pos = position * uSpread;
      pos.z *= 10.0;
      vec4 mPos = modelMatrix * vec4(pos, 1.0);
      float t = uTime;
      mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
      mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
      mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);
      vec4 mvPos = viewMatrix * mPos;
      gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const fragment = `
    precision highp float;
    uniform float uTime;
    uniform float uAlphaParticles;
    varying vec4 vRandom;
    varying vec3 vColor;
    void main() {
      vec2 uv = gl_PointCoord.xy;
      float d = length(uv - vec2(0.5));
      if(uAlphaParticles < 0.5) {
        if(d > 0.5) {
          discard;
        }
        gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
      } else {
        float circle = smoothstep(0.5, 0.4, d) * 0.8;
        gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
      }
    }
  `;

  const container = document.getElementById('particles-bg');
  if (!container) return;

  const renderer = new OGL.Renderer({ dpr: 1, alpha: true });
  const gl = renderer.gl;
  container.appendChild(gl.canvas);
  gl.clearColor(0, 0, 0, 0);

  const camera = new OGL.Camera(gl, { fov: 15 });
  camera.position.set(0, 0, 20);

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  }
  window.addEventListener("resize", resize, false);
  resize();

  // Particle settings
  const particleCount = 200;
  const particleSpread = 10;
  const speed = 0.1;
  const particleColors = defaultColors;
  const alphaParticles = false;
  const particleBaseSize = 100;
  const sizeRandomness = 1;
  const disableRotation = false;

  const count = particleCount;
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const palette = particleColors && particleColors.length > 0 ? particleColors : defaultColors;

  for (let i = 0; i < count; i++) {
    let x, y, z, len;
    do {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      len = x * x + y * y + z * z;
    } while (len > 1 || len === 0);
    const r = Math.cbrt(Math.random());
    positions.set([x * r, y * r, z * r], i * 3);
    randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const col = hexToRgb(palette[Math.floor(Math.random() * palette.length)]);
    colors.set(col, i * 3);
  }

  const geometry = new OGL.Geometry(gl, {
    position: { size: 3, data: positions },
    random: { size: 4, data: randoms },
    color: { size: 3, data: colors },
  });

  const program = new OGL.Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 },
      uSpread: { value: particleSpread },
      uBaseSize: { value: particleBaseSize },
      uSizeRandomness: { value: sizeRandomness },
      uAlphaParticles: { value: alphaParticles ? 1 : 0 },
    },
    transparent: true,
    depthTest: false,
  });

  const particles = new OGL.Mesh(gl, { mode: gl.POINTS, geometry, program });

  let animationFrameId;
  let lastTime = performance.now();
  let elapsed = 0;

  function update(t) {
    animationFrameId = requestAnimationFrame(update);
    const delta = t - lastTime;
    lastTime = t;
    elapsed += delta * speed;

    program.uniforms.uTime.value = elapsed * 0.001;

    if (!disableRotation) {
      particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.1;
      particles.rotation.y = Math.cos(elapsed * 0.0005) * 0.15;
      particles.rotation.z += 0.01 * speed;
    }

    renderer.render({ scene: particles, camera });
  }
  animationFrameId = requestAnimationFrame(update);

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(animationFrameId);
    if (container.contains(gl.canvas)) {
      container.removeChild(gl.canvas);
    }
  });
})();

// --- Ripple effect for tap/click ---
function createRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'ripple';
  ripple.style.left = `${x - 25}px`;
  ripple.style.top = `${y - 25}px`;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

// Touch support
window.addEventListener('touchstart', function(e) {
  if (e.touches && e.touches.length > 0) {
    const touch = e.touches[0];
    createRipple(touch.clientX, touch.clientY);
  }
});
// Mouse support
window.addEventListener('mousedown', function(e) {
  // Only left click
  if (e.button === 0) {
    createRipple(e.clientX, e.clientY);
  }
});

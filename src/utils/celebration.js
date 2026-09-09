// Three.js 3D Coin Celebration Animation (Exact GitHub Version)

export function launchCoinCelebration(numCoins = 1) {
  if (typeof window === 'undefined' || window._celebRunning) return;

  if (!window.THREE) {
    const existing = document.getElementById('threejs-script');
    if (!existing) {
      const s = document.createElement('script');
      s.id = 'threejs-script';
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
      s.onload = () => runCelebration(numCoins);
      document.head.appendChild(s);
    } else {
      existing.addEventListener('load', () => runCelebration(numCoins));
    }
  } else {
    runCelebration(numCoins);
  }
}

function runCelebration(numCoins) {
  if (window._celebRunning) return;
  window._celebRunning = true;
  const THREE = window.THREE;
  if (!THREE) return;

  let canvas = document.getElementById('celebration-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'celebration-canvas';
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.4s ease;';
    document.body.appendChild(canvas);
  }

  /* ── Gold flash then dark backdrop ── */
  const flash = document.createElement('div');
  flash.style.cssText =
    'position:fixed;inset:0;background:rgba(255,220,50,0.55);z-index:99997;pointer-events:none;transition:background 0.55s ease;';
  document.body.appendChild(flash);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      flash.style.background = 'rgba(0,0,0,0.32)';
    })
  );

  /* ── Text banner ── */
  const banner = document.createElement('div');
  const coinWord = numCoins > 1 ? `${numCoins} Coins` : '1 Coin';
  banner.style.cssText = [
    'position:fixed',
    'top:42%',
    'left:50%',
    'transform:translate(-50%,-50%) scale(0) rotate(-6deg)',
    'z-index:100002',
    'pointer-events:none',
    'text-align:center',
    'font-family:Montserrat,sans-serif',
    'font-weight:900',
    'line-height:1.15',
  ].join(';');
  banner.innerHTML =
    '<div style="font-size:clamp(52px,9vw,96px);filter:drop-shadow(0 0 18px #FFD700)">🪙</div>' +
    '<div style="font-size:clamp(28px,5.5vw,62px);color:#fff;text-shadow:0 0 18px #FFD700,0 0 40px #F2A807,0 3px 10px rgba(0,0,0,0.7)">+' +
    coinWord +
    ' Earned!</div>' +
    '<div style="font-size:clamp(13px,2vw,18px);color:rgba(255,230,100,0.9);margin-top:6px;text-shadow:0 0 8px #FFD700,0 2px 6px rgba(0,0,0,0.5)">Keep it up! ⭐</div>';
  document.body.appendChild(banner);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      banner.style.transition =
        'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease';
      banner.style.transform = 'translate(-50%,-50%) scale(1) rotate(0deg)';
    })
  );

  /* ── Renderer ── */
  const W = window.innerWidth,
    H = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, W / H, 0.1, 300);
  camera.position.set(0, 1.5, 20);
  camera.lookAt(0, 0, 0);

  /* ── Lights ── */
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4c0, 3.0);
  sun.position.set(6, 14, 10);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffe080, 1.4);
  rim.position.set(-10, -4, 8);
  scene.add(rim);
  const burst = new THREE.PointLight(0xffdd00, 18, 32);
  burst.position.set(0, 0, 5);
  scene.add(burst);

  /* ── Shockwave rings ── */
  function makeRing(radius, tube, color, opacity) {
    const g = new THREE.TorusGeometry(radius, tube, 10, 90);
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.setScalar(0.01);
    scene.add(mesh);
    return mesh;
  }
  const ring1 = makeRing(0.3, 0.08, 0xffe44a, 0.95);
  const ring2 = makeRing(0.3, 0.05, 0xffbb00, 0.75);
  const ring3 = makeRing(0.3, 0.03, 0xffffff, 0.55);

  /* ── Coin textures ── */
  function makeTex(symbol) {
    const tc = document.createElement('canvas');
    tc.width = 256;
    tc.height = 256;
    const ctx = tc.getContext('2d');
    const g = ctx.createRadialGradient(110, 95, 14, 128, 128, 128);
    g.addColorStop(0, '#FFF0A0');
    g.addColorStop(0.6, '#F2A807');
    g.addColorStop(1, '#7A4800');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 122, 0, Math.PI * 2);
    ctx.fill();
    const rim2 = ctx.createLinearGradient(0, 0, 256, 256);
    rim2.addColorStop(0, 'rgba(255,255,200,0.6)');
    rim2.addColorStop(1, 'rgba(120,70,0,0.2)');
    ctx.strokeStyle = rim2;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,80,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,35,0,0.82)';
    ctx.font = 'bold 96px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,200,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText(symbol, 128, 134);
    return new THREE.CanvasTexture(tc);
  }
  const textures = ['★', '♦', '❤', '⚡', '✨'].map(makeTex);

  /* ── Coins ── */
  const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.14, 48);
  const COUNT = Math.min(60 + numCoins * 15, 120);
  const coins = [];
  for (let i = 0; i < COUNT; i++) {
    const tex = textures[i % textures.length];
    const faceMat = new THREE.MeshPhongMaterial({
      map: tex,
      shininess: 200,
      specular: 0xffffff,
      emissive: new THREE.Color(0.12, 0.07, 0),
    });
    const sideMat = new THREE.MeshPhongMaterial({
      color: 0x8a5500,
      shininess: 90,
      emissive: new THREE.Color(0.06, 0.03, 0),
    });
    const mesh = new THREE.Mesh(coinGeo, [sideMat, faceMat, faceMat]);
    mesh.scale.setScalar(0.45 + Math.random() * 1.05);
    mesh.position.set(
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.4
    );
    const theta = Math.random() * Math.PI * 2,
      phi = Math.acos(2 * Math.random() - 1),
      spd = 10 + Math.random() * 13;
    mesh.userData.vel = {
      x: Math.sin(phi) * Math.cos(theta) * spd,
      y: Math.sin(phi) * Math.sin(theta) * spd + 6,
      z: Math.cos(phi) * spd * 0.4,
    };
    mesh.userData.rot = {
      x: (Math.random() - 0.5) * 14,
      y: (Math.random() - 0.5) * 14,
      z: (Math.random() - 0.5) * 8,
    };
    scene.add(mesh);
    coins.push(mesh);
  }

  /* ── Confetti strips ── */
  const STRIP_COLS = [
    0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xfed766, 0x9b59b6, 0xff9f43, 0x00d2a0,
    0xff4da6, 0x7bec5c,
  ];
  const strips = [];
  for (let i = 0; i < 80; i++) {
    const geo =
      i % 3 === 0
        ? new THREE.PlaneGeometry(0.12, 0.52)
        : new THREE.PlaneGeometry(0.22, 0.22);
    const mat = new THREE.MeshBasicMaterial({
      color: STRIP_COLS[i % STRIP_COLS.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.93,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.3
    );
    const theta = Math.random() * Math.PI * 2,
      phi = Math.acos(2 * Math.random() - 1),
      spd = 8 + Math.random() * 12;
    mesh.userData.vel = {
      x: Math.sin(phi) * Math.cos(theta) * spd,
      y: Math.sin(phi) * Math.sin(theta) * spd + 5,
      z: Math.cos(phi) * spd * 0.25,
    };
    mesh.userData.rot = {
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20,
      z: (Math.random() - 0.5) * 20,
    };
    scene.add(mesh);
    strips.push(mesh);
  }

  /* ── Sparkles ── */
  function makeSparkles(count, color, size) {
    const pos = new Float32Array(count * 3),
      vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      const theta = Math.random() * Math.PI * 2,
        phi = Math.acos(2 * Math.random() - 1),
        spd = 10 + Math.random() * 16;
      vel.push({
        x: Math.sin(phi) * Math.cos(theta) * spd,
        y: Math.sin(phi) * Math.sin(theta) * spd + 5,
        z: Math.cos(phi) * spd * 0.2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return { pts, geo, mat, vel, count };
  }
  const goldSparks = makeSparkles(140, 0xffe44a, 0.24);
  const whiteSparks = makeSparkles(80, 0xffffff, 0.14);

  canvas.style.opacity = '1';

  const GRAVITY = 13.5,
    DURATION = 4400,
    FADE_START = 3200;
  const T0 = performance.now();
  let lastT = T0,
    shakeAmt = 0.35,
    r2 = false,
    r3 = false;

  function tick(now) {
    const elapsed = now - T0,
      dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (elapsed >= DURATION) {
      canvas.style.opacity = '0';
      banner.style.opacity = '0';
      flash.style.background = 'rgba(0,0,0,0)';
      setTimeout(() => {
        renderer.dispose();
        coins.forEach((m) => {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) =>
            x.dispose()
          );
          scene.remove(m);
        });
        strips.forEach((m) => {
          m.geometry.dispose();
          m.material.dispose();
          scene.remove(m);
        });
        [goldSparks, whiteSparks].forEach(({ pts, geo, mat }) => {
          geo.dispose();
          mat.dispose();
          scene.remove(pts);
        });
        [ring1, ring2, ring3].forEach((r) => {
          r.geometry.dispose();
          r.material.dispose();
          scene.remove(r);
        });
        textures.forEach((t) => t.dispose());
        coinGeo.dispose();
        flash.remove();
        banner.remove();
        window._celebRunning = false;
      }, 500);
      return;
    }

    /* Camera shake */
    shakeAmt = Math.max(0, shakeAmt - dt * 0.7);
    camera.position.x = (Math.random() - 0.5) * shakeAmt;
    camera.position.y = 1.5 + (Math.random() - 0.5) * shakeAmt;

    /* Burst light decay */
    burst.intensity = Math.max(0, 18 - elapsed / 100);

    /* Shockwave rings */
    const rp1 = Math.min(elapsed / 600, 1);
    ring1.scale.setScalar(rp1 * 28);
    ring1.material.opacity = Math.max(0, 1 - rp1 * 1.1);
    if (elapsed > 80 && !r2) {
      r2 = true;
    }
    if (r2) {
      const rp2 = Math.min((elapsed - 80) / 650, 1);
      ring2.scale.setScalar(rp2 * 22);
      ring2.material.opacity = Math.max(0, 0.75 - rp2 * 0.85);
    }
    if (elapsed > 180 && !r3) {
      r3 = true;
    }
    if (r3) {
      const rp3 = Math.min((elapsed - 180) / 700, 1);
      ring3.scale.setScalar(rp3 * 16);
      ring3.material.opacity = Math.max(0, 0.55 - rp3 * 0.65);
    }

    /* Coins */
    coins.forEach((m) => {
      m.userData.vel.y -= GRAVITY * dt;
      m.position.x += m.userData.vel.x * dt;
      m.position.y += m.userData.vel.y * dt;
      m.position.z += m.userData.vel.z * dt;
      m.rotation.x += m.userData.rot.x * dt;
      m.rotation.y += m.userData.rot.y * dt;
      m.rotation.z += m.userData.rot.z * dt;
    });

    /* Strips */
    strips.forEach((m) => {
      m.userData.vel.y -= GRAVITY * 0.7 * dt;
      m.position.x += m.userData.vel.x * dt;
      m.position.y += m.userData.vel.y * dt;
      m.position.z += m.userData.vel.z * dt;
      m.rotation.x += m.userData.rot.x * dt;
      m.rotation.y += m.userData.rot.y * dt;
      m.rotation.z += m.userData.rot.z * dt;
    });

    /* Sparkles */
    [goldSparks, whiteSparks].forEach(({ geo, vel, count }) => {
      const pa = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vel[i].y -= GRAVITY * dt;
        pa[i * 3] += vel[i].x * dt;
        pa[i * 3 + 1] += vel[i].y * dt;
        pa[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
    });

    /* Fade */
    if (elapsed > FADE_START) {
      const t = (elapsed - FADE_START) / (DURATION - FADE_START),
        a = Math.max(0, 1 - t);
      canvas.style.opacity = String(a);
      goldSparks.mat.opacity = a;
      whiteSparks.mat.opacity = a * 0.85;
      strips.forEach((m) => {
        m.material.opacity = a * 0.93;
      });
      banner.style.opacity = String(a);
      flash.style.background = 'rgba(0,0,0,' + 0.32 * a + ')';
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

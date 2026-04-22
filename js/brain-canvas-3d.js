/**
 * Brain Renderer — 3D Three.js particle brain
 */

const BrainRenderer = (() => {
  let container, canvas, scene, camera, renderer, controls;
  let particles, geometry, baseColors, labelGroup, cardinalGroup;
  let orientationVisibility = 0; // 0 to 1 for fading
  let lastMoveTime = 0;
  let currentScores = {};
  let _raf = null;

  // 3D coordinates for the regions
  const REGION_3D = {
    visual_saliency:   { position: new THREE.Vector3(-4, 0, 5.5) }, // Occipital + attention areas
    cognitive_ease:    { position: new THREE.Vector3(-5, 2.5, 3) }, // Frontal/Parietal
    emotional_arousal: { position: new THREE.Vector3(3.5, -1, 1) },  // Deep center / Limbic
    value_recognition: { position: new THREE.Vector3(2, -2.5, -3) }, // Striatum / Reward
    memory_encoding:   { position: new THREE.Vector3(2.5, -2, -1) }, // Hippocampus / Temporal
  };

  const particlesCount = 35000;

  function hexToRgb(hex) {
    const h = (hex || 'ffffff').replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function createPointTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    var context = canvas.getContext('2d');
    var gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  }

  function generateBrainGeometry() {
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particlesCount * 3);
    const colors = new Float32Array(particlesCount * 3);
    const sz = new Float32Array(particlesCount);
    baseColors = new Float32Array(particlesCount * 3);

    const simplex = new SimplexNoise();
    let idx = 0;

    for (let i = 0; i < particlesCount; i++) {
      let x, y, z, valid = false, isRight;
      while (!valid) {
        x = (Math.random() - 0.5) * 16;
        y = (Math.random() - 0.5) * 12;
        z = (Math.random() - 0.5) * 16;

        isRight = x > 0;
        let absX = Math.abs(x);

        // Corpus callosum gap
        if (absX < 0.3) {
          // slight chance to have connective tissue
          if (Math.random() > 0.05) continue;
        }

        let rx = absX / 6.0;
        let ry = y / 5.0;
        let rz = z / 6.5;
        let r = rx * rx + ry * ry + rz * rz;

        if (r < 1.0) {
          let noiseVal = simplex.noise3D(x * 0.4, y * 0.4, z * 0.4);
          let r2 = r + (noiseVal * 0.25);
          if (r2 < 1.0 && r2 > 0.8) {
            valid = true;
          } else if (r < 0.8 && Math.random() < 0.08) {
            valid = true;
          }
        }
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      // Left hemisphere is white, Right hemisphere is grey
      let shade;
      if (!isRight) {
        shade = 0.95 + Math.random() * 0.05; // Left: White
      } else {
        shade = 0.45 + Math.random() * 0.15; // Right: Grey
      }

      baseColors[idx] = shade;
      baseColors[idx + 1] = shade;
      baseColors[idx + 2] = shade;

      colors[idx] = baseColors[idx];
      colors[idx + 1] = baseColors[idx + 1];
      colors[idx + 2] = baseColors[idx + 2];

      sz[i] = Math.random() * 0.5 + 0.1;

      idx += 3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  }

  function init() {
    container = document.getElementById('brain-canvas-container');
    if (!container) return;

    // We no longer need the 2D canvas, we will inject Three JS renderer
    const oldCanvas = document.getElementById('brain-canvas');
    if (oldCanvas) {
      oldCanvas.remove();
    }

    // Set up Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#050508');

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 32);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.domElement.id = 'brain-canvas';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.enablePan = false;

    controls.addEventListener('start', () => { lastMoveTime = performance.now(); });
    controls.addEventListener('change', () => { lastMoveTime = performance.now(); });

    // Generate Points
    generateBrainGeometry();

    const sprite = createPointTexture();
    const material = new THREE.PointsMaterial({
      size: 0.25,
      map: sprite,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
      opacity: 0.8
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
    labelGroup = new THREE.Group();
    particles.add(labelGroup);
    
    cardinalGroup = new THREE.Group();
    particles.add(cardinalGroup);

    const ambientGlow = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientGlow);

    createCardinalLabels();

    window.addEventListener('resize', resize);
    resize();

    if (_raf) cancelAnimationFrame(_raf);
    renderLoop(0);
  }

  function resize() {
    if (!container || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function renderLoop(time) {
    _raf = requestAnimationFrame(renderLoop);
    controls.update();

    // Breathing motion
    particles.position.y = Math.sin(time * 0.001) * 0.2;
    particles.rotation.y = Math.sin(time * 0.0005) * 0.05;
    particles.rotation.z = Math.cos(time * 0.0004) * 0.02;

    // Handle cardinal labels visibility fade
    const now = performance.now();
    const isMoving = (now - lastMoveTime) < 1000; 
    const targetVis = isMoving ? 1 : 0;
    orientationVisibility += (targetVis - orientationVisibility) * 0.1;
    
    if (cardinalGroup) {
      cardinalGroup.visible = orientationVisibility > 0.01;
      cardinalGroup.children.forEach(c => {
        if (c.material) c.material.opacity = orientationVisibility * 0.7;
      });
    }

    // Update colours based on activations
    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;
    let anyActive = false;

    for (let key in currentScores) {
      if (currentScores[key] > 0.05) anyActive = true;
    }

    if (anyActive) {
      for (let i = 0; i < particlesCount; i++) {
        let px = posAttr.array[i * 3];
        let py = posAttr.array[i * 3 + 1];
        let pz = posAttr.array[i * 3 + 2];

        // Drastically dim the base colors so highlights pop
        let dimFactor = 0.15;
        let r = baseColors[i * 3] * dimFactor;
        let g = baseColors[i * 3 + 1] * dimFactor;
        let b = baseColors[i * 3 + 2] * dimFactor;

        for (let key in currentScores) {
          let score = currentScores[key];
          if (score > 0.05 && REGION_3D[key]) {
            let target = REGION_3D[key].position;
            let dist = Math.sqrt((px - target.x) ** 2 + (py - target.y) ** 2 + (pz - target.z) ** 2);

            // Greatly increase radius
            let influence = Math.max(0, 1.0 - dist / (6.0 * score));

            if (influence > 0) {
              let rmColor = hexToRgb((typeof UIController !== 'undefined' && UIController.REGION_META && UIController.REGION_META[key]) ? UIController.REGION_META[key].color : '#ffffff');
              // p grows to 1 faster and pulses
              let p = Math.min(1.0, influence * 1.8 * (0.6 + 0.5 * Math.sin(time * 0.005 - dist * 1.2)));

              let actR = (rmColor[0] / 255) * 1.5;
              let actG = (rmColor[1] / 255) * 1.5;
              let actB = (rmColor[2] / 255) * 1.5;

              r = r * (1 - p) + Math.min(1.0, actR) * p;
              g = g * (1 - p) + Math.min(1.0, actG) * p;
              b = b * (1 - p) + Math.min(1.0, actB) * p;

              // Intense white core for high scores
              if (dist < 1.8 * score) {
                r = Math.min(1.0, r + 0.3);
                g = Math.min(1.0, g + 0.3);
                b = Math.min(1.0, b + 0.3);
              }
            }
          }
        }
        colAttr.array[i * 3] = r;
        colAttr.array[i * 3 + 1] = g;
        colAttr.array[i * 3 + 2] = b;
      }
      colAttr.needsUpdate = true;
    } else {
      // Restore base if nothing active
      for (let i = 0; i < particlesCount * 3; i++) {
        colAttr.array[i] = baseColors[i];
      }
      colAttr.needsUpdate = true;
    }

    renderer.render(scene, camera);

    if (labelGroup && camera) {
      labelGroup.children.forEach(s => {
        let dist = camera.position.distanceTo(s.getWorldPosition(new THREE.Vector3()));
        let scale = (dist / 32) * s.userData.originalScale;
        s.scale.set(scale, scale * (220 / 768), 1);
      });
    }

    if (window.UIController && UIController.updateLabelPositions) {
      UIController.updateLabelPositions();
    }
  }

  function setScores(scores) {
    currentScores = scores ? { ...scores } : {};
    update3DLabels();
  }

  function clearScores() {
    currentScores = {};
    update3DLabels();
  }

  function update3DLabels() {
    if (!labelGroup) return;
    // Clear existing sprites
    while (labelGroup.children.length > 0) {
      let child = labelGroup.children[0];
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
      labelGroup.remove(child);
    }

    if (typeof UIController === 'undefined') return;
    const meta = UIController.REGION_META;

    // Sort scores to get top 3
    let top3 = Object.entries(currentScores)
      .filter(([k]) => meta && meta[k])
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    top3.forEach(([key, score]) => {
      if (score < 0.05 || !REGION_3D[key]) return;
      let m = meta[key];
      let pos = REGION_3D[key].position;

      // create canvas
      let canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 220; // Increased height to prevent clipping
      let ctx = canvas.getContext('2d');

      // background
      ctx.fillStyle = 'rgba(15, 15, 20, 0.9)';
      ctx.fillRect(0, 0, 768, 220);

      // color border left
      ctx.fillStyle = m.color;
      ctx.fillRect(0, 0, 10, 220);

      // Header text
      ctx.font = '700 22px "Roboto Mono", monospace';
      ctx.fillStyle = m.color;
      ctx.fillText(m.label.toUpperCase(), 32, 48);

      // percentage
      ctx.textAlign = 'right';
      ctx.font = '700 24px "Roboto Mono", monospace';
      ctx.fillStyle = m.color;
      ctx.fillText(Math.round(score * 100) + '%', 730, 48);

      // note (wrapped text roughly) - Use actual reason if available
      ctx.textAlign = 'left';
      ctx.font = '400 18px "Roboto Mono", monospace';
      ctx.fillStyle = '#aaa';

      const active = UploadManager.getActive();
      const reasons = active?.result?.reasons || {};
      const noteText = reasons[key] || m.label + ' analysis active.';

      let words = noteText.split(' ');
      let line = '';
      let y = 100;
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > 680 && n > 0) {
          ctx.fillText(line, 32, y);
          line = words[n] + ' ';
          y += 32;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 32, y);

      let tex = new THREE.CanvasTexture(canvas);
      let mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      let sprite = new THREE.Sprite(mat);

      // Store base scale to counteract perspective zoom in render loop
      sprite.userData = { originalScale: 9 };
      sprite.scale.set(9, 9 * (220 / 768), 1);
      
      // Push labels radially outward to prevent brain intersection
      let offset = pos.clone().normalize().multiplyScalar(4.5);
      offset.y += 1.5;
      sprite.position.copy(pos).add(offset);

      labelGroup.add(sprite);
    });
  }

  function getRegionScreenPositions() {
    const pos = {};
    if (!camera || !renderer) return pos;
    const widthHalf = 0.5 * renderer.domElement.clientWidth;
    const heightHalf = 0.5 * renderer.domElement.clientHeight;

    Object.entries(REGION_3D).forEach(([key, region]) => {
      let score = currentScores[key] || 0;

      // Clone position and apply brain group rotation!
      let vec = region.position.clone();
      vec.applyEuler(particles.rotation); // critical to follow the model

      vec.project(camera);

      pos[key] = {
        x: (vec.x * widthHalf) + widthHalf,
        y: -(vec.y * heightHalf) + heightHalf,
        visible: score > 0.05 && vec.z < 1.0
      };
    });
    return pos;
  }

  function createCardinalLabels() {
    const labels = [
      { text: 'FRONT', pos: new THREE.Vector3(0, 0, 9) },
      { text: 'BACK',  pos: new THREE.Vector3(0, 0, -9) },
      { text: 'LEFT',  pos: new THREE.Vector3(-8.5, 0, 0) },
      { text: 'RIGHT', pos: new THREE.Vector3(8.5, 0, 0) },
      { text: 'TOP',   pos: new THREE.Vector3(0, 7, 0) },
      { text: 'BOTTOM',pos: new THREE.Vector3(0, -7, 0) }
    ];

    labels.forEach(l => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; 
      ctx.font = '700 20px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.text, 64, 32);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(l.pos);
      sprite.scale.set(3, 1.5, 1);
      
      cardinalGroup.add(sprite);
    });
  }

  return { init, setScores, clearScores, getRegionScreenPositions };
})();

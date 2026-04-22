/**
 * Upload Manager — file uploads, thumbnails, gallery management
 */

const UploadManager = (() => {
  const MAX_FILES    = 3;
  const MAX_SIZE     = 10 * 1024 * 1024; // 10 MB
  const ACCEPTED     = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime'];

  let creatives       = [];
  let activeCreativeId = null;
  let onCreativesChanged = () => {};
  let onActiveChanged    = () => {};

  // ─── Initialize ──────────────────────────────────────────────────────────

  function init(callbacks) {
    onCreativesChanged = callbacks.onCreativesChanged || (() => {});
    onActiveChanged    = callbacks.onActiveChanged    || (() => {});

    const fileInput = document.getElementById('file-input');
    if (!fileInput) return;

    fileInput.addEventListener('change', e => {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    });

    // Drag-and-drop on the whole main canvas area
    const drop = document.getElementById('brain-canvas-container');
    if (drop) {
      drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
      drop.addEventListener('dragleave', ()  => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        handleFiles(Array.from(e.dataTransfer.files));
      });
    }

    renderCreativeList();
    onCreativesChanged(creatives);
  }

  // ─── Handle uploaded files ────────────────────────────────────────────────

  function handleFiles(files) {
    const valid = files.filter(f => {
      if (!ACCEPTED.includes(f.type)) { console.warn(`Skip: unsupported type ${f.type}`); return false; }
      if (f.size > MAX_SIZE)          { console.warn(`Skip: ${f.name} exceeds 10 MB`);    return false; }
      return true;
    });

    const room  = MAX_FILES - creatives.length;
    const toAdd = valid.slice(0, room);
    if (!toAdd.length) { console.warn('Gallery full (5 max)'); return; }

    toAdd.forEach(file => {
      const id       = genId();
      const creative = { id, file, name: cleanName(file.name), thumbnail: null, status: 'pending', result: null };
      creatives.push(creative);

      generateThumbnail(file).then(thumb => {
        creative.thumbnail = thumb;
        renderCreativeList();
      });
    });

    renderCreativeList();
    onCreativesChanged(creatives);

    if (!activeCreativeId && creatives.length > 0) setActive(creatives[0].id);
  }

  // ─── Thumbnail generation ─────────────────────────────────────────────────

  function generateThumbnail(file) {
    return new Promise(resolve => {
      if (file.type.startsWith('video/')) {
        const video   = document.createElement('video');
        video.preload = 'metadata'; video.muted = true;
        video.onloadeddata = () => { video.currentTime = 0.5; };
        video.onseeked = () => {
          const c = canvas96(); const ctx = c.getContext('2d');
          const s = Math.max(96 / video.videoWidth, 96 / video.videoHeight);
          ctx.drawImage(video, (96 - video.videoWidth * s) / 2, (96 - video.videoHeight * s) / 2, video.videoWidth * s, video.videoHeight * s);
          resolve(c.toDataURL('image/jpeg', 0.75));
          URL.revokeObjectURL(video.src);
        };
        video.onerror = () => resolve(null);
        video.src     = URL.createObjectURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const c = canvas96(); const ctx = c.getContext('2d');
            const s = Math.max(96 / img.width, 96 / img.height);
            ctx.drawImage(img, (96 - img.width * s) / 2, (96 - img.height * s) / 2, img.width * s, img.height * s);
            resolve(c.toDataURL('image/jpeg', 0.75));
          };
          img.onerror = () => resolve(null);
          img.src     = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function canvas96() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    return c;
  }

  // ─── Render gallery ──────────────────────────────────────────────────────

  function renderCreativeList() {
    const el = document.getElementById('creative-list');
    if (!el) return;

    if (creatives.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = creatives.map(c => {
      const isActive   = c.id === activeCreativeId;
      const thumbSrc   = c.thumbnail || blankThumb();
      const statusIcon = { pending: '', analyzing: '⟳', analyzed: '✓', error: '✗' }[c.status] || '';
      const accentCol  = { analyzed: 'var(--accent-primary)', error: '#ff4444', analyzing: '#ffcc44' }[c.status] || 'transparent';

      return `
        <div onclick="UploadManager.setActive('${c.id}')"
             style="border-radius:6px; border:2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'};
                    cursor:pointer; overflow:hidden; height:64px; position:relative;">
          <img style="width:100%;height:100%;object-fit:cover;" src="${thumbSrc}" alt="${c.name}" />
          <div style="position:absolute;inset:0;background:${isActive ? 'rgba(124,92,252,0.18)':'rgba(0,0,0,0.02)'};"></div>
          ${statusIcon ? `<div style="position:absolute;top:3px;right:4px;font-size:0.7rem;color:${accentCol};">${statusIcon}</div>` : ''}
        </div>`;
    }).join('');

    const uploadBtn = document.getElementById('btn-custom-upload');
    if (uploadBtn) {
      uploadBtn.style.display = creatives.length >= MAX_FILES ? 'none' : 'block';
    }
  }

  function blankThumb() {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%23151525" width="96" height="96"/></svg>`;
  }

  // ─── Active creative ──────────────────────────────────────────────────────

  function setActive(id) {
    activeCreativeId = id;
    renderCreativeList();
    const creative = creatives.find(c => c.id === id);
    onActiveChanged(creative || null);
  }

  function getActive() { return creatives.find(c => c.id === activeCreativeId) || null; }
  function getAll()    { return creatives; }

  // ─── Status / result helpers ──────────────────────────────────────────────

  function setStatus(id, status) {
    const c = creatives.find(c => c.id === id);
    if (c) { c.status = status; renderCreativeList(); }
  }

  function setResult(id, result) {
    const c = creatives.find(c => c.id === id);
    if (c) { c.result = result; c.status = 'analyzed'; renderCreativeList(); }
  }

  function remove(id) {
    creatives = creatives.filter(c => c.id !== id);
    if (activeCreativeId === id) {
      activeCreativeId = creatives[0]?.id || null;
      onActiveChanged(getActive());
    }
    renderCreativeList();
    onCreativesChanged(creatives);
  }

  function reset() {
    creatives        = [];
    activeCreativeId = null;
    renderCreativeList();
    onCreativesChanged(creatives);
    onActiveChanged(null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function genId()       { return 'c_' + Math.random().toString(36).slice(2, 10); }
  function cleanName(n)  { return n.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }

  return { init, setActive, remove, setStatus, setResult, getAll, getActive, reset };
})();

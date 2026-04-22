/**
 * App Controller — orchestrates upload → analyze → visualize pipeline
 */

const App = (() => {
  let isAnalyzing = false;

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    console.log('[App] Initializing…');

    try {
      // 2D brain canvas
      BrainRenderer.init();

      // Upload manager
      UploadManager.init({
        onCreativesChanged: handleCreativesChanged,
        onActiveChanged:    handleActiveChanged,
      });

      // Reset button
      document.getElementById('btn-reset')?.addEventListener('click', handleReset);

      // Custom upload button (sidebar)
      document.getElementById('btn-custom-upload')?.addEventListener('click', () => {
        document.getElementById('file-input')?.click();
      });

      // Sidebar Toggle
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.getElementById('sidebar-toggle');
      const openBtn = document.getElementById('btn-open-sidebar');

      if (sidebar && toggleBtn && openBtn) {
        toggleBtn.addEventListener('click', () => {
          sidebar.classList.add('collapsed');
          openBtn.classList.add('visible');
          // Trigger a resize to let Three.js know the canvas container changed size
          setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
        });

        openBtn.addEventListener('click', () => {
          sidebar.classList.remove('collapsed');
          openBtn.classList.remove('visible');
          // Trigger a resize to let Three.js know the canvas container changed size
          setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
        });
      }

      // API health
      UIController.setApiStatus('loading', 'Connecting…');
      const ok = await ApiClient.checkHealth().catch(() => false);
      UIController.setApiStatus('ok', ok ? 'Backend Ready' : 'Ready');

    } catch (err) {
      console.error('[App] Init error:', err);
      UIController.setApiStatus('error', 'Init Error');
    }

    // Dynamic Loading Sequence with Smooth Transitions
    const statusEl = document.getElementById('loading-status');
    const messages = [
      "Loading the multimodal model",
      "Installing ad creatives training data",
      "Loading mental models & theories",
      "Starting the sandbox"
    ];
    
    let msgIndex = 0;
    
    const showNextMessage = () => {
      if (!statusEl) return;
      
      // Wait time before starting fade out
      setTimeout(() => {
        msgIndex++;
        
        if (msgIndex < messages.length) {
          // 1. Fade out
          statusEl.classList.add('fade-out');
          
          // 2. Change text after fade out completes (500ms)
          setTimeout(() => {
            statusEl.textContent = messages[msgIndex];
            statusEl.classList.remove('fade-out');
            
            // 3. Recurse
            showNextMessage();
          }, 500);
          
        } else {
          // Final reveal
          document.getElementById('loading-overlay')?.classList.add('hidden');
          document.getElementById('app')?.classList.add('visible');
        }
      }, 1800); // Wait 1.8s between messages
    };
    
    showNextMessage();
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  function handleCreativesChanged(creatives) {
    // Nothing special needed — gallery renders internally
  }

  async function handleActiveChanged(creative) {
    if (!creative) {
      BrainRenderer.clearScores();
      UIController.hideScores();
      const vp = document.getElementById('reference-viewport');
      if (vp) vp.style.display = 'none';
      return;
    }

    // Update reference viewport
    const vp = document.getElementById('reference-viewport');
    if (vp && creative.thumbnail) {
      vp.style.display         = 'block';
      vp.style.backgroundImage = `url('${creative.thumbnail}')`;
    } else if (vp && creative.file) {
      vp.style.display         = 'block';
      vp.style.backgroundImage = `url('${URL.createObjectURL(creative.file)}')`;
    }

    if (creative.result) {
      // Already analyzed — show immediately
      BrainRenderer.setScores(creative.result.scores);
      UIController.showScores(creative.result);
    } else {
      // Clear old UI while loading
      BrainRenderer.clearScores();
      UIController.hideScores();

      if (creative.status !== 'analyzing' && creative.status !== 'error') {
        // Kick off analysis
        analyzeSingle(creative);
      } else if (creative.status === 'analyzing') {
        UIController.setApiStatus('loading', 'Analysis in progress…');
      } else {
        UIController.setApiStatus('error', 'Analysis failed previously.');
      }
    }
  }

  // ─── Analysis pipeline ────────────────────────────────────────────────────

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const activeQueries = new Set();

  async function analyzeSingle(creative) {
    if (activeQueries.has(creative.id)) return;
    activeQueries.add(creative.id);

    UploadManager.setStatus(creative.id, 'analyzing');

    try {
      UIController.setApiStatus('loading', 'Extracting visual components…');
      await delay(900);
      UIController.setApiStatus('loading', 'Mapping semantic parameters…');
      await delay(900);
      UIController.setApiStatus('loading', 'Querying Neural Engine…');

      const result = await ApiClient.analyzeCreative(
        creative.file,
        `Advertisement creative: ${creative.name}. Analyse for neural engagement and brain region activation.`,
        creative.id,
      );

      UploadManager.setResult(creative.id, result);

      // Only update visuals if this creative is still active
      const active = UploadManager.getActive();
      if (active && active.id === creative.id) {
        BrainRenderer.setScores(result.scores);
        UIController.showScores(result);
      }

    } catch (err) {
      console.error('[App] Analysis error detailed:', err);
      UploadManager.setStatus(creative.id, 'error');
      UIController.setApiStatus('error', `Error: ${err.message || 'Check Server'}`);
    } finally {
      activeQueries.delete(creative.id);
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    activeQueries.clear();
    UploadManager.reset();
    BrainRenderer.clearScores();
    UIController.hideScores();
    UIController.setApiStatus('ok', 'Ready');
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

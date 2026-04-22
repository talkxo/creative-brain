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

      // API health
      UIController.setApiStatus('loading', 'Connecting…');
      const ok = await ApiClient.checkHealth().catch(() => false);
      UIController.setApiStatus('ok', ok ? 'Backend Ready' : 'Ready');

    } catch (err) {
      console.error('[App] Init error:', err);
      UIController.setApiStatus('error', 'Init Error');
    }

    // Hide loading overlay
    setTimeout(() => {
      document.getElementById('loading-overlay')?.classList.add('hidden');
      document.getElementById('app')?.classList.add('visible');
    }, 700);
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

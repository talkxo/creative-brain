/**
 * API Client — Neural Engine integration
 */

const ApiClient = (() => {
  // Replace this URL with your deployed Hugging Face Space direct API URL
  // Example: 'https://huggingface-space-name.hf.space'
  const HF_SPACE_URL = 'https://r1sh1-brain-analyzer-api.hf.space'; 
  const API_BASE = HF_SPACE_URL || window.location.origin;

  const TIMEOUT = 60000; // 60s timeout for deep neural analysis

  let apiAvailable = null; // null = unknown, true/false

  async function checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      apiAvailable = data.status === 'ok';
      return apiAvailable;
    } catch {
      apiAvailable = false;
      return false;
    }
  }

  /**
   * Analyze a creative — sends to backend, which tries TRIBEv2 then simulation
   * @param {File} file - The image file
   * @param {string} description - Text description for TRIBEv2
   * @param {string} id - Unique ID for this creative
   * @returns {Object} Analysis results with scores, timeline, source
   */
  async function analyzeCreative(file, description, id) {
    try {
      const formData = new FormData();
      if (file) formData.append('creative', file);
      formData.append('description', description || (file ? `Creative file: ${file.name}` : 'Creative'));
      formData.append('name', file ? file.name : (id || 'creative'));
      formData.append('id', id);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();
      return {
        id: data.id,
        name: data.name,
        scores: data.scores,
        reasons: data.reasons || {},
        timeline: data.timeline || {},
        insights: data.insights || [],
        source: data.source || 'simulation',
      };
    } catch (err) {
      console.error('[ApiClient] Server request failed:', err.message);
      throw new Error(`Analysis failed: ${err.message}`);
    }
  }



  return {
    checkHealth,
    analyzeCreative,
    get isApiAvailable() { return apiAvailable; },
  };
})();

/**
 * UI Controller — Score display, hemisphere logic, floating labels
 */

const UIController = (() => {
  const REGION_META = {
    visual_saliency:   { label: 'Visual Saliency',     color: '#00d4ff', isRight: false },
    cognitive_ease:    { label: 'Cognitive Ease',      color: '#b388ff', isRight: false },
    emotional_arousal: { label: 'Emotional Arousal',   color: '#ff006e', isRight: true  },
    value_recognition: { label: 'Value Recognition',   color: '#ffcc44', isRight: true  },
    memory_encoding:   { label: 'Memory Encoding',     color: '#00e676', isRight: true  },
  };

  let disabledRegions = new Set();
  let latestResult = null;

  // ─── Show Scores ──────────────────────────────────────────────────────────

  function showScores(result) {
    if (!result || !result.scores) return;
    latestResult = result;
    const scores = { ...result.scores };
    const insights = result.insights || [];

    // Calculate Hemisphere Averages
    const leftKeys  = ['visual_saliency', 'cognitive_ease'];
    const rightKeys = ['emotional_arousal', 'value_recognition', 'memory_encoding'];
    const avg = keys => Math.round((keys.reduce((a, k) => a + (scores[k] || 0), 0) / keys.length) * 100);

    const leftContainer = document.getElementById('score-left').parentElement;
    const rightContainer = document.getElementById('score-right').parentElement;
    
    if (leftContainer) {
      leftContainer.className = 'hemi-header-premium';
      leftContainer.innerHTML = `<span class="hemi-label-main">Left / Logical</span> <span class="hemi-val">${avg(leftKeys)}%</span>`;
    }
    if (rightContainer) {
      rightContainer.className = 'hemi-header-premium';
      rightContainer.innerHTML = `<span class="hemi-label-main">Right / Creative</span> <span class="hemi-val">${avg(rightKeys)}%</span>`;
    }

    // Filter out disabled regions for the 3D renderer
    const filteredScores = {};
    for (let k in scores) {
      if (!disabledRegions.has(k)) filteredScores[k] = scores[k];
    }

    // Show Unified Analysis
    const analysisContent = document.getElementById('analysis-content');
    if (analysisContent) analysisContent.style.display = 'flex';
    const analysisHint = document.getElementById('analysis-hint');
    if (analysisHint) analysisHint.style.display = 'none';

    let leftSum = 0, leftCount = 0, rightSum = 0, rightCount = 0;
    Object.keys(REGION_META).forEach(key => {
      const score = scores[key] || 0;
      if (REGION_META[key].isRight) { rightSum += score; rightCount++; }
      else                          { leftSum  += score; leftCount++;  }
    });

    animateNumber(document.getElementById('score-left'),  Math.round((leftCount  > 0 ? leftSum  / leftCount  : 0) * 100));
    animateNumber(document.getElementById('score-right'), Math.round((rightCount > 0 ? rightSum / rightCount : 0) * 100));

    // Score bars
    updateScoreBars(scores, result.reasons || {});

    // Floating labels - now sent to 3D Renderer with disabled filter
    BrainRenderer.setScores(filteredScores);

    // Insights
    const insightsBox  = document.getElementById('insights-box');
    if (insightsBox) {
      insightsBox.style.display = insights.length > 0 ? 'flex' : 'none';
      if (insights.length > 0) updateInsights(insights);
    }

    // Show source badge
    const statusSource = result.source.includes('Gemini') ? 'Cloud Analysis' : 'Live Analysis';
    setApiStatus('ok', statusSource);
  }

  // ─── Hide Scores ─────────────────────────────────────────────────────────

  function hideScores() {
    const analysisContent = document.getElementById('analysis-content');
    if (analysisContent) analysisContent.style.display = 'none';
    const analysisHint = document.getElementById('analysis-hint');
    if (analysisHint) analysisHint.style.display = 'flex';

    const leftBars = document.getElementById('score-bars-left');
    if (leftBars) leftBars.innerHTML = '';
    const rightBars = document.getElementById('score-bars-right');
    if (rightBars) rightBars.innerHTML = '';

    const labelsEl = document.getElementById('brain-labels');
    if (labelsEl) labelsEl.innerHTML = '';

    const insightsBox = document.getElementById('insights-box');
    if (insightsBox) insightsBox.style.display = 'none';
  }

  // ─── Score Bars ──────────────────────────────────────────────────────────

  function updateInsights(insights) {
    const list = document.getElementById('insights-list');
    if (!list) return;

    if (!insights || insights.length === 0) {
      list.innerHTML = '<p class="placeholder-text">No insights detected.</p>';
      return;
    }

    // Generate Carousel HTML
    let carouselHtml = `
      <div class="insights-carousel-container">
        <div class="insights-carousel" id="insights-carousel">
          ${insights.map(txt => `
            <div class="insight-card">
              <div class="box-content-grey" style="min-height:100px;">
                <p class="insight-text">${txt}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${insights.length > 1 ? `
          <div class="carousel-nav" id="carousel-nav">
            ${insights.map((_, i) => `<div class="carousel-dot ${i === 0 ? 'active' : ''}" onclick="UIController.scrollToInsight(${i})"></div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    list.innerHTML = carouselHtml;

    // Attach scroll listener to update dots
    const carousel = document.getElementById('insights-carousel');
    if (carousel) {
      carousel.addEventListener('scroll', () => {
        const index = Math.round(carousel.scrollLeft / carousel.offsetWidth);
        const dots = document.querySelectorAll('.carousel-dot');
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
      });
    }
  }

  function scrollToInsight(i) {
    const carousel = document.getElementById('insights-carousel');
    if (carousel) {
      carousel.scrollTo({
        left: i * carousel.offsetWidth,
        behavior: 'smooth'
      });
    }
  }

  function updateScoreBars(scores, reasons = {}) {
    // Determine the container, we may have separate left/right or a unified #score-bars container
    const container = document.getElementById('score-bars');
    const leftContainer = document.getElementById('score-bars-left');
    const rightContainer = document.getElementById('score-bars-right');

    const buildHtml = (key) => {
      const meta = REGION_META[key];
      const pct  = Math.round((scores[key] || 0) * 100);
      const reasonText = reasons[key] || '';
      const isDisabled = disabledRegions.has(key);
      
      return `
        <div class="score-bar-item ${isDisabled ? 'disabled' : ''}" onclick="UIController.toggleRegion('${key}')" style="cursor:pointer; transition: opacity 0.3s; ${isDisabled ? 'opacity:0.3;' : ''}">
          <div class="score-bar-top">
            <span class="score-bar-name" style="color: ${meta.color}">
              ${meta.label}
            </span>
            <span class="score-bar-value" style="opacity: ${isDisabled ? 0 : 1}">${pct}%</span>
          </div>
          <div class="score-bar-track" style="background: ${isDisabled ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.5)'}">
            <div class="score-bar-fill" style="background:${meta.color}; width:0%; filter: ${isDisabled ? 'grayscale(1) brightness(0.5)' : 'none'}" data-w="${pct}%"></div>
          </div>
          ${reasonText ? `<div class="score-bar-reason" style="display: ${isDisabled ? 'none' : 'block'}">${reasonText}</div>` : ''}
        </div>`;
    };

    if (container) {
       container.innerHTML = Object.keys(REGION_META).map(buildHtml).join('');
    } else if (leftContainer && rightContainer) {
       leftContainer.innerHTML = Object.keys(REGION_META).filter(k => !REGION_META[k].isRight).map(buildHtml).join('');
       rightContainer.innerHTML = Object.keys(REGION_META).filter(k => REGION_META[k].isRight).map(buildHtml).join('');
    }

    requestAnimationFrame(() => {
      document.querySelectorAll('.score-bar-fill').forEach(b => { b.style.width = b.dataset.w; });
    });
  }

  // ─── Floating Labels ─────────────────────────────────────────────────────

  function updateFloatingLabels(scores) {
    const container = document.getElementById('brain-labels');
    if (!container) return;
    container.innerHTML = ''; // 3D Canvas handles labels natively now
  }

  // ─── Label Position Sync (called each animation frame by BrainRenderer) ──

  function updateLabelPositions() {
    // 3D Canvas handles positioning internally. No DOM sync needed.
  }

  // ─── API Status ──────────────────────────────────────────────────────────

  function setApiStatus(status, text) {
    const el = document.getElementById('api-status');
    if (!el) return;
    const dot  = el.querySelector('.status-dot');
    const span = el.querySelector('.status-text');
    if (dot)  { dot.className = 'status-dot'; if (status === 'loading') dot.classList.add('loading'); if (status === 'error') dot.classList.add('error'); }
    if (span) span.textContent = text || status;
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  function animateNumber(el, target) {
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    const t0    = performance.now();
    (function frame(now) {
      const p = Math.min(1, (now - t0) / 800);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * e) + '%';
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  function toggleRegion(key) {
    if (disabledRegions.has(key)) disabledRegions.delete(key);
    else disabledRegions.add(key);
    
    if (latestResult) showScores(latestResult);
  }

  return { showScores, hideScores, setApiStatus, updateLabelPositions, toggleRegion, scrollToInsight, REGION_META };
})();

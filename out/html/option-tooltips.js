(function() {
  var tooltipData = null;
  var tooltipEl = null;

  function normalizeTitle(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim()
      .toLowerCase();
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentSceneId() {
    if (!window.dendryUI || !window.dendryUI.dendryEngine) {
      return '';
    }
    return window.dendryUI.dendryEngine.state.sceneId || '';
  }

  function sceneDataFor(sceneId) {
    if (!tooltipData || !tooltipData.byScene) {
      return null;
    }
    return tooltipData.byScene[sceneId] ||
      tooltipData.byScene[tooltipData.aliases && tooltipData.aliases[sceneId]];
  }

  function dereference(candidate) {
    if (!candidate) {
      return null;
    }
    if (candidate.branch) {
      return candidate;
    }
    var sceneData = sceneDataFor(candidate.sceneId);
    return sceneData && sceneData.options && sceneData.options[candidate.titleKey];
  }

  function hasTooltipContent(data) {
    return !!(data && data.onArrival);
  }

  function lookupTooltip(target) {
    if (!tooltipData) {
      return null;
    }
    var link = target.matches && target.matches('a[data-choice]')
      ? target
      : target.querySelector && target.querySelector('a[data-choice]');
    if (!link) {
      return null;
    }
    var key = normalizeTitle(link.textContent);
    var sceneData = sceneDataFor(currentSceneId());
    var data = null;
    if (sceneData && sceneData.options && sceneData.options[key]) {
      data = sceneData.options[key];
      return hasTooltipContent(data) ? data : null;
    }
    var candidates = tooltipData.byTitle && tooltipData.byTitle[key];
    data = candidates && candidates.length ? dereference(candidates[0]) : null;
    return hasTooltipContent(data) ? data : null;
  }

  function section(title, body) {
    if (!body) {
      return '';
    }
    return '<div class="option-tooltip-section"><strong>' + title + '</strong><br>' + body + '</div>';
  }

  function buildTooltipHTML(data) {
    var requirements = [];
    if (data.viewIf) requirements.push('view-if: ' + escapeHTML(data.viewIf));
    if (data.chooseIf) requirements.push('choose-if: ' + escapeHTML(data.chooseIf));
    if (data.unavailableSubtitle) requirements.push('unavailable: ' + escapeHTML(data.unavailableSubtitle));

    var effects = data.effects && data.effects.length
      ? data.effects.map(escapeHTML).join('<br>')
      : escapeHTML(data.onArrival || '');

    var route = [];
    if (data.goTo) route.push('go-to: ' + escapeHTML(data.goTo));
    if (data.maxVisits) route.push('max-visits: ' + escapeHTML(data.maxVisits));

    var raw = '@' + escapeHTML(data.branch || '') +
      (data.onArrival ? '<br>on-arrival: ' + escapeHTML(data.onArrival) : '');

    return '<div class="option-tooltip-title">' + escapeHTML(data.title || data.branch || 'Option') + '</div>' +
      section('Requirements', requirements.join('<br>')) +
      section('Effects', effects) +
      section('Route/follow-up', route.join('<br>')) +
      section('Raw source', raw);
  }

  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'option_effect_tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function positionTooltip(target) {
    var tooltip = ensureTooltip();
    var rect = target.getBoundingClientRect();
    var top = window.scrollY + rect.bottom + 8;
    var left = window.scrollX + rect.left;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - tooltip.offsetWidth - 12;
    tooltip.style.top = top + 'px';
    tooltip.style.left = Math.max(12, Math.min(left, maxLeft)) + 'px';
  }

  function showTooltip(event) {
    var target = event.currentTarget;
    var data = lookupTooltip(target);
    if (!data) {
      return;
    }
    var tooltip = ensureTooltip();
    tooltip.innerHTML = buildTooltipHTML(data);
    tooltip.style.display = 'block';
    positionTooltip(target);
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
    }
  }

  window.refreshOptionTooltips = function() {
    if (!tooltipData) {
      return;
    }
    var choices = document.querySelectorAll('ul.choices li');
    choices.forEach(function(choice) {
      var link = choice.querySelector('a[data-choice]');
      if (!link || choice.dataset.effectsTooltipAttached) {
        return;
      }
      choice.dataset.effectsTooltipAttached = '1';
      choice.addEventListener('mouseenter', showTooltip);
      choice.addEventListener('mouseleave', hideTooltip);
      link.addEventListener('focus', showTooltip);
      link.addEventListener('blur', hideTooltip);
    });
  };

  fetch('option-tooltips.json')
    .then(function(response) { return response.ok ? response.json() : null; })
    .then(function(data) {
      tooltipData = data;
      window.refreshOptionTooltips();
    })
    .catch(function() {
      tooltipData = null;
    });
}());

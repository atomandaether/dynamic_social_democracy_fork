const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const scenesRoot = path.join(repoRoot, 'source', 'scenes');
const outputPath = path.join(repoRoot, 'out', 'html', 'option-tooltips.json');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function normalizeTitle(value) {
  return String(value || '')
    .replace(/\{![\s\S]*?!\}/g, ' ')
    .replace(/\[\?[\s\S]*?\?\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .toLowerCase();
}

function stripInline(value) {
  return String(value || '')
    .replace(/\{!|\!\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sceneIdsFor(file) {
  const relative = path.relative(scenesRoot, file).replace(/\\/g, '/');
  const noExt = relative.replace(/\.scene\.dry$/, '');
  const dotted = noExt.replace(/\//g, '.');
  const base = path.basename(noExt);
  return Array.from(new Set([dotted, base]));
}

function readContinuation(lines, startIndex, initial) {
  const parts = [initial.trim()];
  let i = startIndex + 1;
  while (i < lines.length && /^\s+/.test(lines[i]) && !/^\s*[-@#]/.test(lines[i])) {
    parts.push(lines[i].trim());
    i += 1;
  }
  return { value: parts.join(' '), nextIndex: i - 1 };
}

function summarizeEffect(statement) {
  const clean = statement.trim().replace(/;$/, '');
  const match = clean.match(/^([A-Za-z_][\w]*)\s*([+\-*/]?=)\s*(.+?)(?:\s+if\s+.+)?$/);
  if (!match) {
    return clean;
  }
  const variable = match[1];
  const op = match[2];
  const value = match[3].trim();
  if (op === '+=') return `+${value} ${variable}`;
  if (op === '-=') return `-${value} ${variable}`;
  if (op === '=') return `${variable} = ${value}`;
  return `${variable} ${op} ${value}`;
}

function optionTitle(option, branch) {
  if (option.title && option.title !== option.branch) {
    return option.title;
  }
  return branch.title || option.title || option.branch;
}

function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const sceneIds = sceneIdsFor(file);
  const options = [];
  const branches = {};
  let currentBranch = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const optionMatch = line.match(/^\s*-\s+@([A-Za-z0-9_]+)\s*:?\s*(.*)$/);
    if (optionMatch) {
      const branch = optionMatch[1];
      const title = optionMatch[2].trim() || branch;
      options.push({
        branch,
        title,
        titleKey: normalizeTitle(title),
        rawOption: line.trim(),
      });
      continue;
    }

    const branchMatch = line.match(/^@([A-Za-z0-9_]+)/);
    if (branchMatch) {
      currentBranch = branchMatch[1];
      branches[currentBranch] = branches[currentBranch] || {
        id: currentBranch,
        title: '',
        subtitle: '',
        unavailableSubtitle: '',
        viewIf: '',
        chooseIf: '',
        onArrival: '',
        onDeparture: '',
        goTo: '',
        isCard: false,
        maxVisits: '',
        raw: [],
      };
      branches[currentBranch].raw.push(line.trim());
      continue;
    }

    if (!currentBranch) {
      continue;
    }

    const fieldMatch = line.match(/^\s*([A-Za-z][\w-]*):\s*(.*)$/);
    if (!fieldMatch) {
      if (line.trim()) branches[currentBranch].raw.push(line.trim());
      continue;
    }

    const field = fieldMatch[1].toLowerCase();
    const rawValue = fieldMatch[2];
    const continued = readContinuation(lines, i, rawValue);
    i = continued.nextIndex;
    const value = stripInline(continued.value);
    branches[currentBranch].raw.push(`${fieldMatch[1]}: ${value}`);

    if (field === 'title') branches[currentBranch].title = value;
    if (field === 'subtitle') branches[currentBranch].subtitle = value;
    if (field === 'unavailable-subtitle') branches[currentBranch].unavailableSubtitle = value;
    if (field === 'view-if') branches[currentBranch].viewIf = value;
    if (field === 'choose-if') branches[currentBranch].chooseIf = value;
    if (field === 'on-arrival') branches[currentBranch].onArrival = value;
    if (field === 'on-departure') branches[currentBranch].onDeparture = value;
    if (field === 'go-to') branches[currentBranch].goTo = value;
    if (field === 'is-card') branches[currentBranch].isCard = value === 'true';
    if (field === 'max-visits') branches[currentBranch].maxVisits = value;
  }

  for (const branch of Object.values(branches)) {
    if (branch.isCard && branch.title) {
      options.push({
        branch: branch.id,
        title: branch.title,
        titleKey: normalizeTitle(branch.title),
        rawOption: `@${branch.id}`,
      });
    }
  }

  return { sceneIds, options, branches };
}

const byScene = {};
const aliases = {};
const byTitle = {};
for (const file of walk(scenesRoot).filter((item) => item.endsWith('.scene.dry'))) {
  const parsed = parseFile(file);
  const primarySceneId = parsed.sceneIds[0];
  const sceneEntry = { options: {}, optionList: [] };

  for (const option of parsed.options) {
    const branch = parsed.branches[option.branch] || {};
    const title = optionTitle(option, branch);
    const effectSource = [branch.onArrival, branch.onDeparture].filter(Boolean).join('; ');
    const effects = effectSource
      ? effectSource.split(';').map(summarizeEffect).filter(Boolean)
      : [];
    const tooltip = {
      branch: option.branch,
      title,
      titleKey: normalizeTitle(title),
      viewIf: branch.viewIf || '',
      chooseIf: branch.chooseIf || '',
      subtitle: branch.subtitle || '',
      unavailableSubtitle: branch.unavailableSubtitle || '',
      onArrival: branch.onArrival || '',
      onDeparture: branch.onDeparture || '',
      effects,
      goTo: branch.goTo || '',
      isCard: !!branch.isCard,
      maxVisits: branch.maxVisits || '',
      raw: (branch.raw || []).slice(0, 12).join('\n'),
    };
    sceneEntry.options[tooltip.titleKey] = tooltip;
    sceneEntry.optionList.push(tooltip);
    if (!byTitle[tooltip.titleKey]) byTitle[tooltip.titleKey] = [];
    byTitle[tooltip.titleKey].push({ sceneId: primarySceneId, titleKey: tooltip.titleKey });
  }

  byScene[primarySceneId] = sceneEntry;
  for (const sceneId of parsed.sceneIds.slice(1)) {
    aliases[sceneId] = primarySceneId;
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ aliases, byScene, byTitle }));
console.log(`Wrote ${outputPath}`);

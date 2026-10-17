const CATEGORIES = ['Rushs', 'Assets', 'Éléments', 'Séquences', 'Musiques'];
const BIN_NAMES = [...CATEGORIES, 'Exports'];
const PAGE_SIZE = 160;
const state = {
  step: 1,
  connected: false,
  currentProject: '',
  sourcePaths: [],
  scanId: '',
  files: [],
  filter: '',
  page: 0,
  scanning: false,
  creating: false,
  ffprobeAvailable: false,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function bytesLabel(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(1).replace('.', ',')} ${units[index]}`;
}

function durationLabel(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function categoryColor(category) {
  return category === 'Rushs' ? 'MOV' : category === 'Musiques' ? 'AUD' : category === 'Séquences' ? 'SEQ' : 'IMG';
}

function destinationText(file) {
  if (file.category !== 'Rushs') return file.category;
  return `Rushs › ${file.cameraBrand || 'À identifier'} › ${file.cameraModel || 'À identifier'} › ${file.shootingDate || 'Date inconnue'}`;
}

function includedFiles() {
  return state.files.filter((file) => file.include);
}

function formatSummary() {
  const files = includedFiles();
  const size = files.reduce((total, file) => total + file.size, 0);
  $('mediaSummary').textContent = state.files.length
    ? `${files.length} média${files.length > 1 ? 's' : ''} retenu${files.length > 1 ? 's' : ''} · ${bytesLabel(size)} · ${state.files.length - files.length} ignoré${state.files.length - files.length > 1 ? 's' : ''}`
    : 'Aucun dossier sélectionné';
  $('toOptions').disabled = !state.files.length || !files.length || !state.scanId || state.scanning || !state.connected;
}

function setStep(step) {
  if (step > 1 && !state.connected) return;
  if (step > 2 && !state.files.length) return;
  state.step = step;
  for (let index = 1; index <= 4; index += 1) {
    $(`view${index}`).hidden = index !== step;
    const stepButton = document.querySelector(`.step[data-step="${index}"]`);
    stepButton.classList.toggle('active', index === step);
    stepButton.classList.toggle('complete', index < step);
    if (index === step) stepButton.setAttribute('aria-current', 'step');
    else stepButton.removeAttribute('aria-current');
  }
  document.querySelectorAll('.step-line').forEach((line, index) => line.classList.toggle('done', index < step - 1));
  if (step === 3) prepareOptionsView();
  if (step === 2) renderSources();
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 5200);
}

function renderBins() {
  $('binPreview').innerHTML = BIN_NAMES.map((name) => `<span class="bin-chip"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h5l1.6 1.7h8.4v7.3H2.5z"/><path d="M2.5 5.5V4h5l1.6 1.7"/></svg>${escapeHTML(name)}</span>`).join('');
}

function renderSources() {
  if (!state.sourcePaths.length) {
    $('sourceList').innerHTML = '<div class="source-empty">Ajoute les dossiers qui contiennent tes rushs, musiques et éléments.</div>';
    return;
  }
  $('sourceList').innerHTML = state.sourcePaths.map((source) => {
    const count = state.files.filter((file) => file.sourceFolder === source).length;
    const bytes = state.files.filter((file) => file.sourceFolder === source).reduce((sum, file) => sum + file.size, 0);
    return `<div class="source-card"><span class="folder-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h7l2 2H21v9H3z"/><path d="M3 7.5V6h7l2 2"/></svg></span><div class="source-info"><div class="source-name" title="${escapeHTML(source)}">${escapeHTML(source)}</div><div class="source-meta">${count} média${count > 1 ? 's' : ''}${count ? ` · ${bytesLabel(bytes)}` : ''}</div></div><button class="source-remove" data-remove-source="${escapeHTML(source)}" aria-label="Retirer ce dossier"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>`;
  }).join('');
  document.querySelectorAll('[data-remove-source]').forEach((button) => {
    button.addEventListener('click', () => {
      state.sourcePaths = state.sourcePaths.filter((source) => source !== button.dataset.removeSource);
      state.files = state.files.filter((file) => file.sourceFolder !== button.dataset.removeSource);
      state.scanId = '';
      renderSources();
      renderTable();
      if (state.sourcePaths.length) scanSelectedSources();
    });
  });
}

function rowReviewText(file) {
  if (file.size === 0) return 'Fichier vide';
  if (!file.verified) return 'Métadonnées non lues';
  if (file.category === 'Rushs' && (!file.cameraBrand || !file.cameraModel || file.cameraBrand === 'À identifier' || file.cameraModel === 'À identifier')) return 'Caméra à identifier';
  if (file.category === 'Rushs' && file.dateSource === 'creation') return 'Date de création utilisée';
  return '';
}

function renderTable() {
  const hasFiles = state.files.length > 0;
  $('tableWrap').hidden = !hasFiles;
  $('tableTools').hidden = !hasFiles;
  $('reviewCount').hidden = !hasFiles;
  if (!hasFiles) {
    $('mediaRows').innerHTML = '';
    $('reviewLabel').textContent = '0 élément à vérifier';
    formatSummary();
    return;
  }

  const query = state.filter.toLocaleLowerCase('fr').trim();
  const filtered = state.files.filter((file) => {
    if ($('hideDuplicates').checked && file.duplicateOf) return false;
    return !query || file.name.toLocaleLowerCase('fr').includes(query) || file.filePath.toLocaleLowerCase('fr').includes(query) || file.category.toLocaleLowerCase('fr').includes(query);
  });
  const start = state.page * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (state.page >= pageCount) state.page = pageCount - 1;
  const reviewCount = state.files.filter((file) => rowReviewText(file)).length;
  $('reviewLabel').textContent = `${reviewCount} élément${reviewCount > 1 ? 's' : ''} à vérifier`;

  if (!visible.length) {
    $('mediaRows').innerHTML = '<tr><td class="empty-filter" colspan="6">Aucun média ne correspond à cette recherche.</td></tr>';
  } else {
    $('mediaRows').innerHTML = visible.map((file) => {
      const review = rowReviewText(file);
      const duplicate = file.duplicateOf ? '<span class="review-mark duplicate-mark">Doublon possible</span>' : '';
      const reviewBadge = review ? `<span class="review-mark">${escapeHTML(review)}</span>` : '';
      const destination = file.category === 'Rushs'
        ? `<div class="destination-edit"><input data-edit="cameraBrand" data-file="${file.id}" value="${escapeHTML(file.cameraBrand)}" placeholder="Marque" aria-label="Marque de caméra pour ${escapeHTML(file.name)}"><input data-edit="cameraModel" data-file="${file.id}" value="${escapeHTML(file.cameraModel)}" placeholder="Modèle" aria-label="Modèle de caméra pour ${escapeHTML(file.name)}"><input type="date" data-edit="shootingDate" data-file="${file.id}" value="${escapeHTML(file.shootingDate)}" aria-label="Date de tournage pour ${escapeHTML(file.name)}"></div>`
        : `<span class="destination-path" title="${escapeHTML(file.category)}">${escapeHTML(file.category)}</span>`;
      return `<tr data-row="${file.id}" class="${file.duplicateOf ? 'duplicate-row' : ''}"><td><div class="file-cell"><span class="file-symbol">${categoryColor(file.category)}</span><div class="file-copy"><div class="file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</div><div class="file-path" title="${escapeHTML(file.filePath)}">${escapeHTML(file.filePath)}</div>${reviewBadge}${duplicate}</div></div></td><td><select class="type-select" data-category="${file.id}" aria-label="Type de ${escapeHTML(file.name)}">${CATEGORIES.map((category) => `<option${file.category === category ? ' selected' : ''}>${escapeHTML(category)}</option>`).join('')}</select></td><td><div class="destination-cell"><span class="folder-icon"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5.5h6l1.4 1.6H18v8.9H2z"/><path d="M2 5.5V4h6l1.4 1.6"/></svg></span>${destination}</div></td><td class="size-cell">${bytesLabel(file.size)}</td><td class="duration-cell">${durationLabel(file.duration)}</td><td><input class="row-toggle" type="checkbox" data-include="${file.id}" ${file.include ? 'checked' : ''} aria-label="Inclure ${escapeHTML(file.name)}"></td></tr>`;
    }).join('');
  }

  updateReviewCount();
  if (pageCount > 1) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="6" class="page-row"><button class="button secondary compact" id="previousPage" ${state.page === 0 ? 'disabled' : ''}>Précédent</button><span>Page ${state.page + 1} sur ${pageCount} · ${filtered.length} médias affichés</span><button class="button secondary compact" id="nextPage" ${state.page + 1 === pageCount ? 'disabled' : ''}>Suivante</button></td>`;
    $('mediaRows').append(row);
    $('previousPage').addEventListener('click', () => { state.page -= 1; renderTable(); });
    $('nextPage').addEventListener('click', () => { state.page += 1; renderTable(); });
  }

  document.querySelectorAll('[data-category]').forEach((select) => {
    select.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === select.dataset.category);
      if (file) file.category = select.value;
      renderTable();
    });
  });
  document.querySelectorAll('[data-edit]').forEach((input) => {
    input.addEventListener('input', () => {
      const file = state.files.find((item) => item.id === input.dataset.file);
      if (file) file[input.dataset.edit] = input.value;
    });
    input.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === input.dataset.file);
      if (file) file[input.dataset.edit] = input.value;
    });
  });
  document.querySelectorAll('[data-include]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const file = state.files.find((item) => item.id === checkbox.dataset.include);
      if (file) file.include = checkbox.checked;
      checkbox.closest('tr').classList.toggle('excluded-row', !checkbox.checked);
      formatSummary();
    });
  });
  formatSummary();
}

function updateReviewCount() {
  const count = state.files.filter((file) => rowReviewText(file)).length;
  $('reviewLabel').textContent = `${count} élément${count > 1 ? 's' : ''} à vérifier`;
}

function setScanProgress(progress) {
  const bar = $('progressBar');
  const text = $('progressText');
  if (progress.stage !== 'scan') return;
  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  bar.style.width = `${percent}%`;
  text.textContent = `${progress.label} · ${progress.current} / ${progress.total}`;
}

async function scanSelectedSources() {
  if (!state.sourcePaths.length) return;
  state.scanning = true;
  $('scanProgress').hidden = false;
  $('toOptions').disabled = true;
  $('chooseSources').disabled = true;
  $('progressBar').style.width = '0%';
  $('progressText').textContent = 'Préparation de l’analyse…';
  try {
    const result = await window.projectTool.scanSources(state.sourcePaths);
    state.scanId = result.scanId;
    state.files = result.files;
    state.ffprobeAvailable = result.ffprobeAvailable;
    $('probeWarning').hidden = result.ffprobeAvailable;
    $('tableWrap').scrollTop = 0;
    state.page = 0;
    renderSources();
    renderTable();
  } catch (error) {
    showToast(error.message || 'Analyse des dossiers impossible.');
    state.files = [];
    state.scanId = '';
    renderTable();
  } finally {
    state.scanning = false;
    $('scanProgress').hidden = true;
    $('chooseSources').disabled = false;
    formatSummary();
  }
}

async function chooseSources() {
  try {
    const paths = await window.projectTool.chooseSources();
    if (!paths.length) return;
    const next = [...new Set([...state.sourcePaths, ...paths])];
    if (next.length === state.sourcePaths.length) return;
    state.sourcePaths = next;
    state.files = [];
    state.scanId = '';
    renderSources();
    renderTable();
    await scanSelectedSources();
  } catch (error) {
    showToast(error.message || 'Impossible de choisir les dossiers.');
  }
}

function prepareOptionsView() {
  const files = includedFiles();
  const size = files.reduce((sum, file) => sum + file.size, 0);
  const rushes = files.filter((file) => file.category === 'Rushs');
  const reviews = files.filter((file) => rowReviewText(file)).length;
  const summary = [
    ['project', $('projectName').value.trim(), 'Projet Resolve'],
    ['media', `${files.length}`, 'Médias retenus'],
    ['size', bytesLabel(size), 'Taille totale'],
    ['formats', `${new Set(files.map((file) => file.extension)).size}`, 'Formats détectés'],
    ['cameras', `${new Set(rushes.filter((file) => file.cameraBrand && file.cameraModel && file.cameraBrand !== 'À identifier' && file.cameraModel !== 'À identifier').map((file) => `${file.cameraBrand}|${file.cameraModel}`)).size}`, 'Caméras identifiées'],
    ['review', `${reviews}`, 'À vérifier']
  ];
  $('creationSummary').innerHTML = summary.map(([, value, label]) => `<div class="summary-item"><div class="summary-value">${escapeHTML(value)}</div><div class="summary-label">${escapeHTML(label)}</div></div>`).join('');
  $('finalMediaSummary').textContent = `${rushes.length} rush${rushes.length > 1 ? 's' : ''} · ${files.length - rushes.length} autre${files.length - rushes.length === 1 ? '' : 's'} média${files.length - rushes.length === 1 ? '' : 's'}`;
  $('openProjectNote').hidden = !state.currentProject;
  $('openProjectText').textContent = state.currentProject
    ? `Le projet ouvert « ${state.currentProject} » sera enregistré avant la création.`
    : 'Aucun autre projet ouvert dans Resolve.';
  $('createNow').disabled = !state.connected || state.creating || !files.length;
}

function updateCreateProgress(progress) {
  if (!state.creating || progress.stage === 'scan') return;
  const bar = $('createProgressBar');
  const text = $('createProgressText');
  const fraction = progress.total ? progress.current / progress.total : 0;
  const stageBase = progress.stage === 'project' ? 0 : progress.stage === 'bins' ? .08 : progress.stage === 'import' ? .25 : 1;
  const stageWeight = progress.stage === 'project' ? .08 : progress.stage === 'bins' ? .17 : progress.stage === 'import' ? .75 : 0;
  bar.style.width = `${Math.min(99, Math.round((stageBase + stageWeight * fraction) * 100))}%`;
  text.textContent = progress.label || 'Préparation dans Resolve…';
}

function renderCompletion(result) {
  setStep(4);
  const hasWarning = Boolean(result.warning || result.failedNames?.length);
  $('completionMark').classList.toggle('warning-mark', hasWarning);
  $('completionTitle').textContent = hasWarning ? 'Projet créé avec des points à vérifier' : 'Projet prêt';
  $('completionSubtitle').textContent = `« ${result.projectName} » est ouvert dans DaVinci Resolve.`;
  const rows = [
    ['Médias importés', `${result.importedCount}`],
    ['Doublons ignorés', `${result.excludedCount}`],
    ['Chutiers créés', BIN_NAMES.join(' · ')],
    ['Timeline', result.timelineName ? `${result.timelineName} · ${result.timelineFormat}` : 'Aucune timeline créée']
  ];
  $('completionReport').innerHTML = rows.map(([label, value]) => `<div class="report-row"><span>${escapeHTML(label)}</span><span>${escapeHTML(value)}</span></div>`).join('');
  const warningParts = [result.warning, result.failedNames?.length ? `À vérifier : ${result.failedNames.slice(0, 6).join(', ')}${result.failedNames.length > 6 ? ` et ${result.failedNames.length - 6} autre(s)` : ''}.` : ''];
  $('completionWarning').textContent = warningParts.filter(Boolean).join(' ');
  $('completionWarning').hidden = !hasWarning;
  const showProxyGuide = $('prepareProxies').checked;
  $('proxyGuide').hidden = !showProxyGuide;
  $('proxySourceList').innerHTML = state.sourcePaths.map((source) => `<li>${escapeHTML(source)}</li>`).join('');
}

async function createProjectNow() {
  const name = $('projectName').value.trim();
  if (!name) return showToast('Saisis un nom de projet.');
  if (/[\\/:\u0000-\u001f]/.test(name)) return showToast('Le nom ne peut pas contenir de barre oblique.');
  if (name.length > 100) return showToast('Le nom du projet doit contenir 100 caractères maximum.');
  state.creating = true;
  $('createProgress').hidden = false;
  $('createProgressBar').style.width = '0%';
  $('createNow').disabled = true;
  $('createNow').textContent = 'Création…';
  try {
    const result = await window.projectTool.createProject({
      projectName: name,
      scanId: state.scanId,
      createTimeline: $('createTimeline').checked,
      files: state.files.map(({ id, category, cameraBrand, cameraModel, shootingDate, include }) => ({ id, category, cameraBrand, cameraModel, shootingDate, include }))
    });
    renderCompletion(result);
  } catch (error) {
    showToast(error.message || 'Création du projet impossible.');
  } finally {
    state.creating = false;
    $('createProgress').hidden = true;
    $('createNow').textContent = 'Créer le projet';
    $('createNow').disabled = false;
  }
}

async function refreshStatus() {
  try {
    const result = await window.projectTool.getStatus();
    state.connected = result.connected;
    state.currentProject = result.currentProject || '';
    const label = result.connected
      ? (state.currentProject ? `Projet ouvert : ${state.currentProject}` : 'Connecté à Resolve')
      : `Connexion à Resolve indisponible · ${result.error || ''}`;
    $('connectionState').textContent = label;
    $('retryConnection').hidden = result.connected;
    $('toSources').disabled = !result.connected;
    formatSummary();
  } catch (_) {
    state.connected = false;
    $('connectionState').textContent = 'Connexion à Resolve indisponible';
    $('retryConnection').hidden = false;
    $('toSources').disabled = true;
  }
}

document.querySelectorAll('.step').forEach((button) => button.addEventListener('click', () => {
  const target = Number(button.dataset.step);
  if (target < state.step && target < 4) setStep(target);
}));
$('closeTop').addEventListener('click', () => window.projectTool.close());
$('finish').addEventListener('click', () => window.projectTool.finish());
$('openProxyGenerator').addEventListener('click', async () => {
  const button = $('openProxyGenerator');
  button.disabled = true;
  try {
    await window.projectTool.openProxyGenerator();
    showToast('Blackmagic Proxy Generator est ouvert. Ajoute les dossiers affichés comme dossiers surveillés.');
  } catch (error) {
    showToast(error.message || 'Impossible d’ouvrir Blackmagic Proxy Generator.');
  } finally {
    button.disabled = false;
  }
});
$('toSources').addEventListener('click', () => setStep(2));
$('backToProject').addEventListener('click', () => setStep(1));
$('toOptions').addEventListener('click', () => setStep(3));
$('backToSources').addEventListener('click', () => setStep(2));
$('chooseSources').addEventListener('click', chooseSources);
$('createNow').addEventListener('click', createProjectNow);
$('filterInput').addEventListener('input', (event) => { state.filter = event.target.value; state.page = 0; renderTable(); });
$('hideDuplicates').addEventListener('change', (event) => {
  if (event.target.checked) state.files.filter((file) => file.duplicateOf).forEach((file) => { file.include = false; });
  else state.files.filter((file) => file.duplicateOf).forEach((file) => { file.include = true; });
  renderTable();
});
$('retryConnection').addEventListener('click', async () => {
  $('retryConnection').disabled = true;
  try { await window.projectTool.reconnect(); } finally { $('retryConnection').disabled = false; await refreshStatus(); }
});
window.projectTool.onProgress((progress) => {
  if (progress.stage === 'scan') setScanProgress(progress);
  else updateCreateProgress(progress);
  if (progress.stage === 'error') showToast(progress.label);
});

renderBins();
renderSources();
renderTable();
refreshStatus();

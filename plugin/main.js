const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const WorkflowIntegration = require('./WorkflowIntegration.node');
const { addWatchFolders, isProcessRunning } = require('./proxy-settings');

const execFileAsync = promisify(execFile);
const PLUGIN_ID = 'com.idolatry.resolveprojectcreationtool';
const BIN_NAMES = ['Rushs', 'Assets', 'Éléments', 'Séquences', 'Musiques', 'Exports'];
const VIDEO = new Set(['.mov', '.mp4', '.m4v', '.mxf', '.avi', '.mpg', '.mpeg', '.mkv', '.mts', '.m2ts', '.braw', '.r3d', '.ari', '.crm', '.3gp', '.webm']);
const AUDIO = new Set(['.wav', '.aif', '.aiff', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma']);
const STILL = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp', '.heic', '.heif', '.exr', '.dpx', '.dng', '.arw', '.cr2', '.cr3', '.nef', '.raf']);
const GRAPHIC = new Set(['.psd', '.ai', '.eps', '.svg', '.pdf']);
const SEQUENCE = new Set(['.fcpxml', '.edl', '.aaf', '.drt', '.otio', '.xml']);
const SUPPORTED = new Set([...VIDEO, ...AUDIO, ...STILL, ...GRAPHIC, ...SEQUENCE]);
const PROBE_PATHS = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];
const PROXY_GENERATOR_APP = '/Applications/Blackmagic Proxy Generator.app';
const PROXY_GENERATOR_EXECUTABLE = `${PROXY_GENERATOR_APP}/Contents/MacOS/Blackmagic Proxy Generator`;

let mainWindow;
let resolveObj;
let projectManager;
let integrationReady = false;
let integrationError = '';
let creationInProgress = false;
let ffprobePath;
const scanSnapshots = new Map();
const operations = new Map();

function sendProgress(event, payload) {
  if (!event.sender.isDestroyed()) event.sender.send('tool:progress', payload);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Opération interrompue.');
    error.name = 'AbortError';
    throw error;
  }
}

function runOperation(event, operationId, task) {
  if (typeof operationId !== 'string' || !operationId) throw new Error('Identifiant d’opération invalide.');
  if (operations.has(operationId)) throw new Error('Cette opération est déjà en cours.');
  const controller = new AbortController();
  const onDestroyed = () => controller.abort();
  operations.set(operationId, controller);
  event.sender.once('destroyed', onDestroyed);
  return Promise.resolve().then(() => task(controller.signal)).catch((error) => {
    if (error?.name === 'AbortError') return { cancelled: true };
    throw error;
  }).finally(() => {
    event.sender.removeListener('destroyed', onDestroyed);
    operations.delete(operationId);
  });
}

async function connectResolve() {
  integrationReady = false;
  integrationError = '';
  try {
    const initialized = await WorkflowIntegration.Initialize(PLUGIN_ID);
    if (!initialized) throw new Error('Resolve refuse la connexion au plugin.');
    resolveObj = await WorkflowIntegration.GetResolve();
    if (!resolveObj) throw new Error('Resolve API ne répond pas.');
    projectManager = await resolveObj.GetProjectManager();
    if (!projectManager) throw new Error('Gestionnaire de projets Resolve introuvable.');
    integrationReady = true;
  } catch (error) {
    integrationError = error.message || 'Connexion à Resolve impossible.';
    resolveObj = null;
    projectManager = null;
  }
  return integrationReady;
}

async function findFFprobe() {
  if (ffprobePath !== undefined) return ffprobePath;
  for (const candidate of [path.join(__dirname, 'ffprobe'), ...PROBE_PATHS, ...((process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, 'ffprobe')))]) {
    try {
      await fs.access(candidate);
      ffprobePath = candidate;
      return ffprobePath;
    } catch (_) {}
  }
  ffprobePath = null;
  return null;
}

function cleanText(value) {
  return String(value || '').trim().replace(/[\u0000-\u001f]/g, '');
}

function metadataValue(tags, candidates) {
  const entries = Object.entries(tags || {}).map(([key, value]) => [key.toLowerCase(), cleanText(value)]);
  for (const candidate of candidates) {
    const match = entries.find(([key, value]) => key === candidate.toLowerCase() && value);
    if (match) return match[1];
  }
  return '';
}

function normalizeBrand(value, model = '') {
  const input = `${value} ${model}`.toLowerCase();
  const brands = [
    ['sony', 'Sony'], ['canon', 'Canon'], ['red', 'RED'], ['arri', 'ARRI'],
    ['blackmagic', 'Blackmagic'], ['panasonic', 'Panasonic'], ['fujifilm', 'Fujifilm'],
    ['nikon', 'Nikon'], ['gopro', 'GoPro'], ['dji', 'DJI'], ['apple', 'Apple']
  ];
  return brands.find(([needle]) => input.includes(needle))?.[1] || cleanText(value);
}

function cameraModel(tags) {
  return metadataValue(tags, [
    'com.blackmagic-design.camera.cameraModel', 'camera_model', 'cameraModel',
    'model_name', 'model', 'com.apple.quicktime.model'
  ]);
}

function cameraMake(tags) {
  return metadataValue(tags, [
    'com.blackmagic-design.camera.make', 'camera_make', 'make',
    'com.apple.quicktime.make', 'manufacturer'
  ]);
}

async function readCanonSidecar(filePath) {
  const sidecarPath = `${filePath.slice(0, -path.extname(filePath).length)}.XML`;
  try {
    const stat = await fs.stat(sidecarPath);
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;
    const xml = await fs.readFile(sidecarPath, 'utf8');
    // Canon sidecars are tiny metadata documents. Reject DTD/entity declarations
    // and read only the two expected leaf values to avoid external entity parsing.
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
    const leaf = (name) => {
      const match = xml.match(new RegExp(`<${name}\\b[^>]*>([^<]*)<\\/${name}\\s*>`, 'i'));
      return match ? cleanText(match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")) : '';
    };
    const make = leaf('Manufacturer');
    const model = leaf('ModelName');
    return make || model ? { cameraMake: make, cameraModel: model } : null;
  } catch (_) {
    return null;
  }
}

function normalizeDate(value) {
  const input = cleanText(value);
  const match = input.match(/(\d{4})[-:]?(\d{2})[-:]?(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function frameRate(streams) {
  const stream = streams.find((item) => item.codec_type === 'video' && item.width && item.height);
  if (!stream) return null;
  const raw = stream.avg_frame_rate && stream.avg_frame_rate !== '0/0' ? stream.avg_frame_rate : stream.r_frame_rate;
  if (!raw) return { width: stream.width, height: stream.height, fps: null };
  const [numerator, denominator = '1'] = raw.split('/').map(Number);
  const fps = denominator ? numerator / denominator : numerator;
  return { width: stream.width, height: stream.height, fps: Number.isFinite(fps) ? Number(fps.toFixed(3)) : null };
}

async function probeWithFFprobe(filePath, signal) {
  const probe = await findFFprobe();
  if (!probe) return null;
  try {
    const { stdout } = await execFileAsync(probe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      signal
    });
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const tags = Object.assign({}, data.format?.tags || {}, ...streams.map((stream) => stream.tags || {}));
    const duration = Number(data.format?.duration || streams.find((item) => item.duration)?.duration);
    return {
      cameraMake: cameraMake(tags),
      cameraModel: cameraModel(tags),
      date: normalizeDate(metadataValue(tags, ['creation_time', 'com.apple.quicktime.creationdate', 'date_recorded', 'date'])),
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      format: frameRate(streams),
      verified: streams.length > 0
    };
  } catch (_) {
    throwIfAborted(signal);
    return { verified: false };
  }
}

async function probeWithSpotlight(filePath, signal) {
  const names = ['kMDItemAcquisitionMake', 'kMDItemAcquisitionModel', 'kMDItemContentCreationDate', 'kMDItemDurationSeconds', 'kMDItemPixelWidth', 'kMDItemPixelHeight'];
  try {
    const { stdout } = await execFileAsync('/usr/bin/mdls', [...names.flatMap((name) => ['-name', name]), filePath], { timeout: 8000, maxBuffer: 64 * 1024, signal });
    const values = Object.fromEntries(stdout.split('\n').map((line) => {
      const index = line.indexOf(' = ');
      return index < 0 ? ['', ''] : [line.slice(0, index).trim(), line.slice(index + 3).trim().replace(/^"|"$/g, '')];
    }));
    const number = (key) => Number(values[key]);
    const width = number('kMDItemPixelWidth');
    const height = number('kMDItemPixelHeight');
    const duration = number('kMDItemDurationSeconds');
    return {
      cameraMake: cleanText(values.kMDItemAcquisitionMake),
      cameraModel: cleanText(values.kMDItemAcquisitionModel),
      date: normalizeDate(values.kMDItemContentCreationDate),
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      format: width && height ? { width, height, fps: null } : null,
      verified: Boolean(width || height || duration || values.kMDItemContentCreationDate)
    };
  } catch (_) {
    throwIfAborted(signal);
    return { verified: false };
  }
}

function categoryFor(extension) {
  if (VIDEO.has(extension)) return 'Rushs';
  if (AUDIO.has(extension)) return 'Musiques';
  if (SEQUENCE.has(extension)) return 'Séquences';
  if (GRAPHIC.has(extension)) return 'Assets';
  if (STILL.has(extension)) return 'Éléments';
  return null;
}

function isProxyDirectory(name) {
  return name.toLocaleLowerCase('en-US') === 'proxy';
}

async function scanDirectory(root, signal) {
  const resolved = await fs.realpath(root);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error(`Dossier source invalide : ${root}`);
  const files = [];
  const canonSidecars = new Set();
  const pending = [resolved];
  while (pending.length) {
    throwIfAborted(signal);
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    throwIfAborted(signal);
    entries.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
    for (const entry of entries) {
      throwIfAborted(signal);
      if (entry.name.startsWith('.')) continue;
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.endsWith('.app') && !entry.name.endsWith('.bundle') && !isProxyDirectory(entry.name)) pending.push(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (VIDEO.has(extension)) {
        const sidecar = `${filePath.slice(0, -extension.length)}.XML`;
        try {
          if ((await fs.stat(sidecar)).isFile()) canonSidecars.add(path.resolve(sidecar));
        } catch (_) {}
      }
      if (SUPPORTED.has(extension)) files.push({ filePath, extension, category: categoryFor(extension) });
    }
  }
  return files.filter((file) => !canonSidecars.has(path.resolve(file.filePath)));
}

async function enrichFile(file, signal) {
  throwIfAborted(signal);
  const stat = await fs.stat(file.filePath);
  const [probe, fallback] = await Promise.all([
    probeWithFFprobe(file.filePath, signal),
    findFFprobe().then((probePath) => probePath ? null : probeWithSpotlight(file.filePath, signal))
  ]);
  throwIfAborted(signal);
  const metadata = { ...(probe || fallback || { verified: false }) };
  if (VIDEO.has(file.extension) && (!metadata.cameraMake || !metadata.cameraModel)) {
    const sidecar = await readCanonSidecar(file.filePath);
    if (sidecar) {
      metadata.cameraMake ||= sidecar.cameraMake;
      metadata.cameraModel ||= sidecar.cameraModel;
    }
  }
  throwIfAborted(signal);
  const rawMake = metadata.cameraMake || '';
  const rawModel = metadata.cameraModel || '';
  const shootingDate = metadata.date || localDate(stat.birthtime);
  const isVideo = VIDEO.has(file.extension);
  const missingVideoMetadata = isVideo && (!rawMake || !rawModel);
  return {
    id: crypto.randomUUID(),
    filePath: file.filePath,
    name: path.basename(file.filePath),
    sourceFolder: file.sourceFolder,
    extension: file.extension,
    category: file.category,
    size: stat.size,
    duration: metadata.duration || null,
    width: metadata.format?.width || null,
    height: metadata.format?.height || null,
    fps: metadata.format?.fps || null,
    cameraBrand: isVideo ? normalizeBrand(rawMake, rawModel) || '' : '',
    cameraModel: isVideo ? rawModel : '',
    shootingDate: isVideo ? shootingDate : '',
    dateSource: isVideo ? (metadata.date ? 'metadata' : 'creation') : '',
    verified: metadata.verified,
    needsReview: stat.size === 0 || !metadata.verified || missingVideoMetadata,
    duplicateOf: null,
    include: true
  };
}

function markDuplicates(files) {
  const firstByFingerprint = new Map();
  for (const file of files) {
    if (!file.duration) continue;
    const fingerprint = `${file.name.toLocaleLowerCase('fr')}|${file.size}|${file.duration.toFixed(2)}`;
    const first = firstByFingerprint.get(fingerprint);
    if (first) {
      file.duplicateOf = first.id;
      file.include = false;
      file.duplicateAutoExcluded = true;
    } else {
      firstByFingerprint.set(fingerprint, file);
    }
  }
}

async function scanSources(event, paths, signal) {
  if (!Array.isArray(paths) || !paths.length) throw new Error('Choisis au moins un dossier source.');
  const roots = [...new Set(paths.map((item) => path.resolve(item)))];
  const allFiles = [];
  for (let index = 0; index < roots.length; index += 1) {
    throwIfAborted(signal);
    const files = await scanDirectory(roots[index], signal);
    allFiles.push(...files.map((file) => ({ ...file, sourceFolder: roots[index] })));
  }
  throwIfAborted(signal);
  const seenPaths = new Set();
  const uniqueFiles = allFiles.filter((file) => {
    const key = path.resolve(file.filePath);
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  });
  if (!uniqueFiles.length) throw new Error('Aucun média reconnu dans les dossiers choisis.');

  const results = new Array(uniqueFiles.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < uniqueFiles.length) {
      throwIfAborted(signal);
      const index = cursor++;
      results[index] = await enrichFile(uniqueFiles[index], signal);
      completed += 1;
      if (completed % 5 === 0 || completed === uniqueFiles.length) {
        sendProgress(event, { stage: 'scan', current: completed, total: uniqueFiles.length, label: 'Analyse des médias' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, uniqueFiles.length) }, worker));
  throwIfAborted(signal);
  markDuplicates(results);
  scanSnapshots.clear();
  const scanId = crypto.randomUUID();
  scanSnapshots.set(scanId, results);
  return {
    scanId,
    files: results,
    roots: roots.map((folder) => ({ path: folder, name: path.basename(folder) || folder })),
    ffprobeAvailable: Boolean(await findFFprobe())
  };
}

function hashFile(filePath, signal) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath, { signal });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyDuplicateContents(event, options, signal) {
  const scanId = options?.scanId;
  const files = scanSnapshots.get(scanId);
  if (!files) throw new Error('Analyse expirée. Reprends la sélection des dossiers.');
  const selections = new Map((options?.files || []).map((file) => [file.id, file]));
  for (const file of files) {
    const selection = selections.get(file.id);
    if (!selection) continue;
    file.include = selection.include !== false;
    if (selection.duplicateManuallyChanged) file.duplicateAutoExcluded = false;
  }
  const byId = new Map(files.map((file) => [file.id, file]));
  const groups = new Map();
  for (const file of files) {
    if (!file.duplicateOf) continue;
    const group = groups.get(file.duplicateOf) || [byId.get(file.duplicateOf)];
    group.push(file);
    groups.set(file.duplicateOf, group);
  }
  const jobs = [...groups.values()];
  const total = jobs.reduce((sum, group) => sum + group.length, 0);
  if (!total) return { identicalGroups: 0, distinctFiles: 0, unreadableGroups: 0 };
  let completed = 0;
  let identicalGroups = 0;
  let distinctFiles = 0;
  let unreadableGroups = 0;
  let cursor = 0;
  const originalFiles = files.map((file) => ({ ...file }));
  async function worker() {
    while (cursor < jobs.length) {
      throwIfAborted(signal);
      const group = jobs[cursor++];
      let processed = 0;
      try {
        const hashes = [];
        for (const file of group) {
          hashes.push(await hashFile(file.filePath, signal));
          processed += 1;
          completed += 1;
          sendProgress(event, { stage: 'duplicate-check', current: completed, total, label: 'Comparaison du contenu' });
        }
        const clusters = new Map();
        group.forEach((file, index) => {
          const cluster = clusters.get(hashes[index]) || [];
          cluster.push(file);
          clusters.set(hashes[index], cluster);
        });
        for (const cluster of clusters.values()) {
          const primary = cluster[0];
          primary.duplicateOf = null;
          if (primary.duplicateAutoExcluded) {
            primary.include = true;
            distinctFiles += 1;
          }
          primary.duplicateAutoExcluded = false;
          for (const file of cluster.slice(1)) {
            file.duplicateOf = primary.id;
            file.duplicateVerification = 'identical';
          }
          if (cluster.length > 1) identicalGroups += 1;
        }
      } catch (_) {
        throwIfAborted(signal);
        for (const file of group.slice(1)) file.duplicateVerification = 'unreadable';
        unreadableGroups += 1;
        completed += group.length - processed;
        sendProgress(event, { stage: 'duplicate-check', current: completed, total, label: 'Comparaison du contenu' });
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, worker));
  } catch (error) {
    if (signal?.aborted) originalFiles.forEach((file, index) => { files[index] = file; });
    throw error;
  }
  return { identicalGroups, distinctFiles, unreadableGroups };
}

function normalizeProjectName(value) {
  const name = cleanText(value).trim();
  if (!name) throw new Error('Saisis un nom de projet.');
  if (name.length > 100) throw new Error('Le nom du projet doit contenir 100 caractères maximum.');
  if (/[\\/:\u0000-\u001f]/.test(name)) throw new Error('Le nom ne peut pas contenir de barre oblique.');
  return name;
}

function safeBinName(value, fallback) {
  const name = cleanText(value).replace(/[\\/:\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || fallback).slice(0, 80);
}

async function findOrCreateFolder(mediaPool, parent, name) {
  const children = await parent.GetSubFolderList();
  for (const folder of children || []) {
    if (await folder.GetName() === name) return folder;
  }
  const folder = await mediaPool.AddSubFolder(parent, name);
  if (!folder) throw new Error(`Impossible de créer le chutier « ${name} ».`);
  return folder;
}

async function createProject(event, options) {
  if (!integrationReady || !projectManager) throw new Error(integrationError || 'Connexion à Resolve indisponible.');
  if (creationInProgress) throw new Error('Création déjà en cours.');
  const name = normalizeProjectName(options?.projectName);
  const snapshot = scanSnapshots.get(options?.scanId);
  if (!snapshot) throw new Error('Analyse expirée. Reprends la sélection des dossiers.');
  const edited = new Map((options.files || []).map((file) => [file.id, file]));
  const selected = snapshot.map((original) => {
    const edit = edited.get(original.id) || {};
    const category = BIN_NAMES.slice(0, 5).includes(edit.category) ? edit.category : original.category;
    const include = edit.include !== false;
    return {
      ...original,
      category,
      include,
      cameraBrand: safeBinName(edit.cameraBrand, 'À identifier'),
      cameraModel: safeBinName(edit.cameraModel, 'À identifier'),
      shootingDate: /^\d{4}-\d{2}-\d{2}$/.test(edit.shootingDate || '') ? edit.shootingDate : original.shootingDate || 'Date inconnue'
    };
  }).filter((file) => file.include);
  if (!selected.length) throw new Error('Aucun média à importer.');

  creationInProgress = true;
  let projectCreated = false;
  try {
    const projects = await projectManager.GetProjectListInCurrentFolder();
    if ((projects || []).includes(name)) throw new Error(`Un projet nommé « ${name} » existe déjà dans ce dossier Resolve.`);
    let currentProject = null;
    try { currentProject = await projectManager.GetCurrentProject(); } catch (_) {}
    let savedProject = '';
    if (currentProject) {
      savedProject = await currentProject.GetName();
      const saved = await projectManager.SaveProject();
      if (!saved) throw new Error(`Resolve n’a pas pu enregistrer le projet ouvert « ${savedProject} ».`);
    }

    sendProgress(event, { stage: 'project', current: 0, total: 1, label: 'Création du projet Resolve' });
    const project = await projectManager.CreateProject(name);
    if (!project) throw new Error(`Resolve n’a pas créé le projet « ${name} ». Vérifie la liste des projets.`);
    projectCreated = true;
    const mediaPool = await project.GetMediaPool();
    if (!mediaPool) throw new Error('Projet créé, mais chutier principal inaccessible.');
    const root = await mediaPool.GetRootFolder();
    if (!root) throw new Error('Projet créé, mais chutier principal inaccessible.');

    const bins = {};
    for (let index = 0; index < BIN_NAMES.length; index += 1) {
      const binName = BIN_NAMES[index];
      bins[binName] = await findOrCreateFolder(mediaPool, root, binName);
      sendProgress(event, { stage: 'bins', current: index + 1, total: BIN_NAMES.length, label: `Création du chutier ${binName}` });
    }

    const importable = selected.filter((file) => !SEQUENCE.has(file.extension));
    const sequenceFiles = selected.filter((file) => SEQUENCE.has(file.extension));
    const groupMap = new Map();
    for (const file of importable) {
      let destination = bins[file.category] || bins.Assets;
      let key = file.category;
      if (file.category === 'Rushs') {
        const brand = safeBinName(file.cameraBrand, 'À identifier');
        const model = safeBinName(file.cameraModel, 'À identifier');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(file.shootingDate) ? file.shootingDate : 'Date inconnue';
        const brandBin = await findOrCreateFolder(mediaPool, bins.Rushs, brand);
        const modelBin = await findOrCreateFolder(mediaPool, brandBin, model);
        destination = await findOrCreateFolder(mediaPool, modelBin, date);
        key = `${brand}|${model}|${date}`;
      }
      if (!groupMap.has(key)) groupMap.set(key, { destination, files: [] });
      groupMap.get(key).files.push(file);
    }

    const importedRushes = [];
    const failures = [];
    const groups = [...groupMap.values()];
    const totalBatches = groups.reduce((total, group) => total + Math.ceil(group.files.length / 25), 0) + sequenceFiles.length;
    let completedBatches = 0;
    for (const group of groups) {
      const selectedFolder = await mediaPool.SetCurrentFolder(group.destination);
      if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner un chutier.');
      for (let offset = 0; offset < group.files.length; offset += 25) {
        const batch = group.files.slice(offset, offset + 25);
        const result = await mediaPool.ImportMedia(batch.map((file) => file.filePath));
        const items = Array.isArray(result) ? result : [];
        for (let index = 0; index < batch.length; index += 1) {
          if (!items[index]) failures.push(batch[index].name);
          else if (batch[index].category === 'Rushs') importedRushes.push({ file: batch[index], item: items[index] });
        }
        completedBatches += 1;
        sendProgress(event, { stage: 'import', current: completedBatches, total: Math.max(totalBatches, 1), label: 'Import des médias dans Resolve' });
      }
    }

    const sequenceFailures = [];
    if (sequenceFiles.length) {
      const selectedFolder = await mediaPool.SetCurrentFolder(bins.Séquences);
      if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner le chutier Séquences.');
      for (const file of sequenceFiles) {
        try {
          const timeline = await mediaPool.ImportTimelineFromFile(file.filePath);
          if (!timeline) sequenceFailures.push(file.name);
        } catch (_) {
          sequenceFailures.push(file.name);
        }
        completedBatches += 1;
        sendProgress(event, { stage: 'import', current: completedBatches, total: Math.max(totalBatches, 1), label: 'Import des séquences' });
      }
    }

    let timelineName = '';
    let timelineFormat = '';
    let timelineWarning = '';
    if (options.createTimeline && importedRushes.length) {
      const dominant = dominantFormat(importedRushes.map(({ file }) => file));
      const settings = {
        timelineResolutionWidth: String(dominant.width),
        timelineResolutionHeight: String(dominant.height),
        timelineFrameRate: String(dominant.fps || 24)
      };
      const settingsApplied = await project.SetSettings(settings);
      if (!settingsApplied) timelineWarning = 'Resolve a gardé ses réglages de timeline par défaut.';
      const selectedFolder = await mediaPool.SetCurrentFolder(bins.Séquences);
      if (!selectedFolder) throw new Error('Resolve n’a pas pu sélectionner le chutier Séquences.');
      timelineName = `${name} — Assemblage`;
      const timeline = await mediaPool.CreateTimelineFromClips(timelineName, importedRushes.map(({ item }) => ({ mediaPoolItem: item })));
      if (!timeline) {
        timelineName = '';
        timelineWarning = 'Resolve n’a pas créé la timeline. Le projet et les médias sont conservés.';
      } else {
        timelineFormat = `${dominant.width} × ${dominant.height} · ${dominant.fps || 24} i/s`;
      }
    } else if (options.createTimeline) {
      timelineWarning = 'Aucun rush vidéo retenu. La timeline d’assemblage n’a pas été créée.';
    }

    const saved = await projectManager.SaveProject();
    if (!saved) timelineWarning = [timelineWarning, 'Le projet a été créé, mais Resolve n’a pas confirmé son enregistrement.'].filter(Boolean).join(' ');
    scanSnapshots.delete(options.scanId);
    return {
      ok: true,
      projectName: name,
      importedCount: selected.length - failures.length - sequenceFailures.length,
      excludedCount: snapshot.length - selected.length,
      failedNames: [...failures, ...sequenceFailures],
      createdBins: BIN_NAMES,
      timelineName,
      timelineFormat,
      warning: [timelineWarning, failures.length ? `${failures.length} média(s) n’ont pas été importés.` : '', sequenceFailures.length ? `${sequenceFailures.length} séquence(s) n’ont pas été importées.` : ''].filter(Boolean).join(' '),
      savedProject
    };
  } catch (error) {
    if (projectCreated && projectManager) {
      try { await projectManager.SaveProject(); } catch (_) {}
      throw new Error(`${error.message} Le projet « ${name} » peut être partiellement créé. Vérifie-le dans Resolve avant de relancer l’assistant.`);
    }
    throw error;
  } finally {
    creationInProgress = false;
  }
}

function dominantFormat(files) {
  const formats = new Map();
  for (const file of files) {
    if (!file.width || !file.height) continue;
    const fps = file.fps ? Number(file.fps.toFixed(3)) : null;
    const key = `${file.width}x${file.height}@${fps || 'unknown'}`;
    formats.set(key, { width: file.width, height: file.height, fps, count: (formats.get(key)?.count || 0) + 1 });
  }
  const ordered = [...formats.values()].sort((a, b) => b.count - a.count || b.width * b.height - a.width * a.height);
  if (ordered.length && (ordered.length === 1 || ordered[0].count > ordered[1].count)) return ordered[0];
  return { width: 1920, height: 1080, fps: ordered.find((item) => item.fps)?.fps || 24 };
}

function registerHandlers() {
  ipcMain.handle('tool:status', async () => {
    let currentProject = '';
    if (integrationReady && projectManager) {
      try {
        const current = await projectManager.GetCurrentProject();
        if (current) currentProject = await current.GetName();
      } catch (_) {}
    }
    return { connected: integrationReady, error: integrationError, currentProject, ffprobeAvailable: Boolean(await findFFprobe()) };
  });
  ipcMain.handle('tool:reconnect', connectResolve);
  ipcMain.handle('tool:choose-sources', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir les dossiers de médias',
      buttonLabel: 'Analyser les dossiers',
      properties: ['openDirectory', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('tool:scan-sources', (event, operationId, paths) => runOperation(event, operationId, (signal) => scanSources(event, paths, signal)));
  ipcMain.handle('tool:verify-duplicates', (event, operationId, options) => runOperation(event, operationId, (signal) => verifyDuplicateContents(event, options, signal)));
  ipcMain.handle('tool:cancel-operation', (_event, operationId) => {
    const controller = operations.get(operationId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
  ipcMain.handle('tool:create-project', (event, options) => createProject(event, options));
  ipcMain.handle('tool:open-proxy-generator', async (_event, sourcePaths) => {
    try {
      await fs.access(PROXY_GENERATOR_APP);
      if (await isProcessRunning(PROXY_GENERATOR_EXECUTABLE)) {
        throw new Error('Ferme Blackmagic Proxy Generator puis réessaie. Il doit être fermé pour actualiser sa liste de dossiers surveillés.');
      }
      const settingsPath = path.join(app.getPath('home'), 'Library', 'Preferences', 'Blackmagic Design', 'Blackmagic Proxy Generator', 'ProxyGeneratorSettings.plist');
      const added = await addWatchFolders(settingsPath, sourcePaths);
      await execFileAsync('/usr/bin/open', ['-a', PROXY_GENERATOR_APP]);
      return { added };
    } catch (error) {
      throw new Error(error.message || 'Impossible d’ajouter les dossiers ou d’ouvrir Blackmagic Proxy Generator.');
    }
  });
  ipcMain.handle('tool:finish', async () => {
    if (integrationReady && resolveObj) {
      try { await resolveObj.OpenPage('edit'); } catch (_) {}
    }
    mainWindow?.close();
    return true;
  });
  ipcMain.handle('tool:close', () => mainWindow?.close());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    title: 'Resolve Project Creation Tool',
    backgroundColor: '#111315',
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (creationInProgress) {
      event.preventDefault();
      mainWindow.webContents.send('tool:progress', { stage: 'error', label: 'Attends la fin de la création avant de fermer.' });
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  registerHandlers();
  await connectResolve();
  createWindow();
});

app.on('before-quit', () => {
  if (integrationReady) WorkflowIntegration.CleanUp();
});

app.on('window-all-closed', () => app.quit());

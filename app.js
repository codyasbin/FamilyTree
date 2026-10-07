const STORAGE_KEY = 'kinship-family-tree-v1';
const defaultState = {
  family: 'The Whitmore family', settings: { showTips: true }, selectedId: 'eleanor',
  nodes: [
    { id: 'arthur', name: 'Arthur Whitmore', birth: '1912', death: '1988', location: 'York, England', about: 'A quiet builder with a love of old maps.', x: 205, y: 205, clan: 'Whitmore roots', color: 'yellow' },
    { id: 'margaret', name: 'Margaret Whitmore', birth: '1918', death: '2003', location: 'York, England', about: '', x: 435, y: 205, clan: 'Whitmore roots', color: 'lavender' },
    { id: 'eleanor', name: 'Eleanor Whitmore', birth: '1942', death: '', location: 'Bath, England', about: 'Keeps the family stories alive through letters, recipes, and long Sunday lunches.', x: 320, y: 390, clan: 'The Whitmore family', color: 'mint' },
    { id: 'james', name: 'James Mercer', birth: '1940', death: '2017', location: 'Bristol, England', about: '', x: 560, y: 390, clan: 'The Mercer family', color: 'coral' },
    { id: 'joseph', name: 'Joseph Whitmore', birth: '1968', death: '', location: 'London, England', about: '', x: 160, y: 585, clan: 'The Whitmore family', color: 'lavender' },
    { id: 'olivia', name: 'Olivia Whitmore', birth: '1971', death: '', location: 'London, England', about: '', x: 370, y: 585, clan: 'The Whitmore family', color: 'mint' },
    { id: 'henry', name: 'Henry Mercer', birth: '1970', death: '', location: 'Bristol, England', about: '', x: 590, y: 585, clan: 'The Mercer family', color: 'yellow' },
    { id: 'sophie', name: 'Sophie Mercer', birth: '2000', death: '', location: 'Brighton, England', about: '', x: 585, y: 780, clan: 'The Mercer family', color: 'coral' }
  ],
  relations: [['arthur', 'margaret', 'partner'], ['arthur', 'eleanor', 'parent'], ['margaret', 'eleanor', 'parent'], ['eleanor', 'james', 'partner'], ['eleanor', 'joseph', 'parent'], ['eleanor', 'olivia', 'parent'], ['james', 'henry', 'parent'], ['james', 'sophie', 'parent']]
};

const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
function normalizeState(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.relations)) return clone(defaultState);
  const family = String(data.family || 'My family');
  const nodes = data.nodes.map((node) => ({ ...node }));
  if (family !== defaultState.family) nodes.forEach((node) => { if (node.clan === defaultState.family) node.clan = family; });
  return { family, settings: { ...defaultState.settings, ...(data.settings || {}) }, selectedId: data.selectedId, nodes, relations: data.relations };
}
function loadState() { try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return clone(defaultState); } }

let state = loadState();
let currentView = 'tree';
let view = { x: -30, y: -85, scale: .93, panning: false, startX: 0, startY: 0, originX: 0, originY: 0 };
let history = [clone(state)], historyIndex = 0;
const nodeLayer = $('nodeLayer'), connectorLayer = $('connectorLayer'), groupLayer = $('groupLayer'), world = $('canvasWorld'), viewport = $('canvasViewport');

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function snapshot() { history = history.slice(0, historyIndex + 1); history.push(clone(state)); historyIndex++; saveState(); updateHistoryButtons(); }
function initials(name = '') { return name.split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join('').toUpperCase() || '?'; }
function person(id) { return state.nodes.find((item) => item.id === id); }
function relatives(id) {
  return state.relations.filter((r) => r[0] === id || r[1] === id).map((r) => {
    const isFirst = r[0] === id, other = isFirst ? r[1] : r[0];
    let type = r[2];
    if (type === 'parent') type = isFirst ? 'Child' : 'Parent';
    else type = type.charAt(0).toUpperCase() + type.slice(1);
    return { person: person(other), type };
  }).filter((r) => r.person);
}
function generationCount() { return Math.max(1, new Set(state.nodes.map((n) => Math.round(n.y / 180))).size); }
function render() { renderNodes(); renderConnections(); renderGroups(); renderInspector(); renderMinimap(); updateMeta(); applyView(); if (currentView !== 'tree') renderContentView(); }

function renderNodes() {
  const query = $('searchInput').value.trim().toLowerCase(); nodeLayer.innerHTML = '';
  state.nodes.forEach((item) => {
    const card = document.createElement('article');
    card.className = `node-card ${item.id === state.selectedId ? 'selected' : ''} ${query && !`${item.name} ${item.location || ''}`.toLowerCase().includes(query) ? 'dimmed' : ''}`;
    card.dataset.id = item.id; card.tabIndex = 0; card.style.left = `${item.x}px`; card.style.top = `${item.y}px`;
    card.innerHTML = `<div class="node-avatar ${escapeHtml(item.color || 'mint')}">${item.photo ? `<img src="${escapeHtml(item.photo)}" alt="">` : escapeHtml(initials(item.name))}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.birth || '—')} — ${escapeHtml(item.death || 'present')}</p><span class="node-tag">${escapeHtml(item.clan || 'Family')}</span>`;
    card.addEventListener('pointerdown', startNodeDrag);
    card.addEventListener('click', () => selectPerson(item.id));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPerson(item.id); } });
    nodeLayer.appendChild(card);
  });
}
function renderConnections() {
  connectorLayer.innerHTML = ''; const nodes = new Map(state.nodes.map((item) => [item.id, item]));
  state.relations.forEach(([aId, bId]) => { const a = nodes.get(aId), b = nodes.get(bId); if (!a || !b) return; const ax = a.x + 83, ay = a.y + 39, bx = b.x + 83, by = b.y + 39, midY = ay + (by - ay) / 2; const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`); if (a.id === state.selectedId || b.id === state.selectedId) path.classList.add('highlight'); connectorLayer.appendChild(path); });
}
function renderGroups() {
  groupLayer.innerHTML = ''; const groups = {};
  state.nodes.forEach((node) => { if (node.clan) (groups[node.clan] ||= []).push(node); });
  Object.entries(groups).forEach(([name, nodes]) => { if (nodes.length < 2) return; const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y), group = document.createElement('div'); group.className = 'clan-group'; group.style.left = `${Math.min(...xs) - 28}px`; group.style.top = `${Math.min(...ys) - 31}px`; group.style.width = `${Math.max(...xs) - Math.min(...xs) + 222}px`; group.style.height = `${Math.max(...ys) - Math.min(...ys) + 140}px`; group.innerHTML = `<h4><span>${escapeHtml(name)}</span></h4>`; groupLayer.appendChild(group); });
}
function renderInspector() {
  const selected = person(state.selectedId) || state.nodes[0]; if (!selected) { $('inspector').classList.add('hidden'); return; }
  state.selectedId = selected.id; $('inspectorName').textContent = selected.name; $('detailName').value = selected.name; $('detailBirth').value = selected.birth || ''; $('detailDeath').value = selected.death || ''; $('detailLocation').value = selected.location || ''; $('detailAbout').value = selected.about || ''; $('detailNotes').value = selected.notes || ''; $('detailSources').value = selected.sources || '';
  $('inspectorDates').textContent = `${selected.birth || 'Unknown'} — ${selected.death || 'present'}`; $('livingLabel').innerHTML = selected.death ? '<i></i> Remembered' : '<i></i> Living';
  const photo = $('profilePhoto'); photo.innerHTML = selected.photo ? `<img src="${escapeHtml(selected.photo)}" alt="${escapeHtml(selected.name)}">` : escapeHtml(initials(selected.name));
  const links = relatives(selected.id); $('connectionList').innerHTML = links.length ? links.map(({ person: related, type }) => `<button class="connection-row" data-person-id="${escapeHtml(related.id)}"><div class="connection-avatar">${escapeHtml(initials(related.name))}</div><div><strong>${escapeHtml(related.name)}</strong><span>${escapeHtml(type)}</span></div></button>`).join('') : '<div class="empty-connections">No connections yet.</div>';
  $('connectionList').querySelectorAll('[data-person-id]').forEach((button) => button.addEventListener('click', () => selectPerson(button.dataset.personId)));
}
function renderMinimap() { $('minimapMap').innerHTML = ''; state.nodes.forEach((n) => { const dot = document.createElement('i'); dot.className = `mini-dot ${n.id === state.selectedId ? 'active' : ''}`; dot.style.left = `${n.x / 15}px`; dot.style.top = `${n.y / 15}px`; $('minimapMap').appendChild(dot); }); }
function updateMeta() { $('peopleCount').textContent = state.nodes.length; $('treeSummary').textContent = `${state.nodes.length} ${state.nodes.length === 1 ? 'person' : 'people'} · ${generationCount()} generations`; $('familyName').childNodes[0].textContent = `${state.family} `; $('breadcrumbFamily').textContent = state.family.replace(/^The /, ''); $('canvasHelp').hidden = state.settings.showTips === false; updateHistoryButtons(); }
function updateHistoryButtons() { $('undoButton').disabled = historyIndex <= 0; $('redoButton').disabled = historyIndex >= history.length - 1; }
function applyView() { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`; $('zoomValue').textContent = `${Math.round(view.scale * 100)}%`; }
function selectPerson(id) { state.selectedId = id; if (currentView === 'tree') $('inspector').classList.remove('hidden'); render(); }

function startNodeDrag(event) {
  if (event.button !== 0) return; const card = event.currentTarget, item = person(card.dataset.id), start = { x: event.clientX, y: event.clientY, nodeX: item.x, nodeY: item.y }; let moved = false;
  card.setPointerCapture(event.pointerId);
  const move = (e) => { if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true; item.x = start.nodeX + (e.clientX - start.x) / view.scale; item.y = start.nodeY + (e.clientY - start.y) / view.scale; card.style.left = `${item.x}px`; card.style.top = `${item.y}px`; renderConnections(); renderGroups(); renderMinimap(); };
  const end = () => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', end); if (moved) snapshot(); };
  card.addEventListener('pointermove', move); card.addEventListener('pointerup', end);
}
viewport.addEventListener('pointerdown', (event) => { if (event.target.closest('.node-card') || event.button !== 0) return; view.panning = true; view.startX = event.clientX; view.startY = event.clientY; view.originX = view.x; view.originY = view.y; viewport.classList.add('is-panning'); viewport.setPointerCapture(event.pointerId); });
viewport.addEventListener('pointermove', (event) => { if (!view.panning) return; view.x = view.originX + event.clientX - view.startX; view.y = view.originY + event.clientY - view.startY; applyView(); });
viewport.addEventListener('pointerup', () => { view.panning = false; viewport.classList.remove('is-panning'); });
viewport.addEventListener('pointercancel', () => { view.panning = false; viewport.classList.remove('is-panning'); });
viewport.addEventListener('wheel', (event) => { event.preventDefault(); const rect = viewport.getBoundingClientRect(), mouseX = event.clientX - rect.left, mouseY = event.clientY - rect.top, old = view.scale, next = Math.max(.35, Math.min(1.8, old * (event.deltaY > 0 ? .92 : 1.08))); view.x = mouseX - ((mouseX - view.x) / old) * next; view.y = mouseY - ((mouseY - view.y) / old) * next; view.scale = next; applyView(); }, { passive: false });

function setView(name) {
  currentView = name; const isTree = name === 'tree'; $('canvasStage').hidden = !isTree; $('contentView').hidden = isTree; $('inspector').classList.toggle('hidden', !isTree); document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name)); $('viewLabel').textContent = isTree ? '' : ` / ${name.charAt(0).toUpperCase() + name.slice(1)}`; closeMobileNav(); if (!isTree) renderContentView();
}
function renderContentView() {
  const body = $('contentBody');
  if (currentView === 'people') {
    $('contentEyebrow').textContent = 'Family directory'; $('contentTitle').textContent = 'People'; $('contentSubtitle').textContent = `${state.nodes.length} people in ${state.family}`; $('contentAddButton').hidden = false;
    body.innerHTML = `<div class="people-grid">${[...state.nodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => `<button class="person-list-card" data-person-id="${escapeHtml(n.id)}"><div class="large-avatar ${escapeHtml(n.color || 'mint')}">${n.photo ? `<img src="${escapeHtml(n.photo)}" alt="">` : escapeHtml(initials(n.name))}</div><div><h3>${escapeHtml(n.name)}</h3><p>${escapeHtml(n.birth || 'Unknown')} — ${escapeHtml(n.death || 'present')}</p><span>${escapeHtml(n.location || 'Location unknown')}</span></div><b>View</b></button>`).join('')}</div>`;
  } else if (currentView === 'groups') {
    const groups = Object.entries(state.nodes.reduce((all, node) => { (all[node.clan || 'Ungrouped'] ||= []).push(node); return all; }, {}));
    $('contentEyebrow').textContent = 'Family branches'; $('contentTitle').textContent = 'Clans & groups'; $('contentSubtitle').textContent = `${groups.length} branches keep this tree organized`; $('contentAddButton').hidden = true;
    body.innerHTML = `<div class="group-grid">${groups.map(([name, nodes]) => `<article class="group-card"><div class="group-card-head"><span>${nodes.length} ${nodes.length === 1 ? 'person' : 'people'}</span><button class="group-edit" data-edit-group="${escapeHtml(name)}">Rename</button></div><h3>${escapeHtml(name)}</h3><p>Choose a person to move them to another group.</p><div class="group-people">${nodes.map((n) => `<button data-move-person="${escapeHtml(n.id)}" title="Move ${escapeHtml(n.name)}">${escapeHtml(initials(n.name))}<small>${escapeHtml(n.name)}</small></button>`).join('')}</div></article>`).join('')}</div>`;
  } else {
    const dated = [...state.nodes].filter((n) => /^\d{4}$/.test(n.birth)).sort((a, b) => Number(a.birth) - Number(b.birth));
    $('contentEyebrow').textContent = 'Across generations'; $('contentTitle').textContent = 'Timeline'; $('contentSubtitle').textContent = 'Births and lives in chronological order'; $('contentAddButton').hidden = true;
    body.innerHTML = `<div class="timeline-list">${dated.map((n) => `<button class="timeline-event" data-person-id="${escapeHtml(n.id)}"><time>${escapeHtml(n.birth)}</time><i></i><div><h3>${escapeHtml(n.name)}</h3><p>Born${n.location ? ` in ${escapeHtml(n.location)}` : ''}${n.death ? ` · remembered ${escapeHtml(n.death)}` : ''}</p></div></button>`).join('')}</div>`;
  }
  body.querySelectorAll('[data-person-id]').forEach((button) => button.addEventListener('click', () => { state.selectedId = button.dataset.personId; setView('tree'); render(); }));
  body.querySelectorAll('[data-edit-group]').forEach((button) => button.addEventListener('click', () => {
    const oldName = button.dataset.editGroup;
    const newName = prompt('Rename this clan or group:', oldName)?.trim();
    if (!newName || newName === oldName) return;
    state.nodes.forEach((node) => { if ((node.clan || 'Ungrouped') === oldName) node.clan = newName; });
    snapshot(); render(); toast(`Group renamed to ${newName}`);
  }));
  body.querySelectorAll('[data-move-person]').forEach((button) => button.addEventListener('click', () => {
    const member = person(button.dataset.movePerson);
    const choices = [...new Set(state.nodes.map((node) => node.clan || 'Ungrouped'))].join(', ');
    const newGroup = prompt(`Move ${member.name} to which group?\nExisting groups: ${choices}`, member.clan || 'Ungrouped')?.trim();
    if (!newGroup || newGroup === (member.clan || 'Ungrouped')) return;
    member.clan = newGroup;
    snapshot(); render(); toast(`${member.name} moved to ${newGroup}`);
  }));
}

function zoomAt(factor) { view.scale = Math.max(.35, Math.min(1.8, view.scale * factor)); applyView(); }
function openPersonModal() { $('personModal').classList.add('open'); setTimeout(() => $('personForm').elements.name.focus(), 50); }
function closePersonModal() { $('personModal').classList.remove('open'); }
function closeMobileNav() { $('sidebar').classList.remove('mobile-open'); $('sidebarScrim').classList.remove('open'); }
function openPhotoViewer(src, name) { if (!src) return; $('fullSizePhoto').src = src; $('fullSizePhoto').alt = `${name} portrait`; $('photoCaption').textContent = name; $('photoViewer').classList.add('open'); $('closePhotoViewer').focus(); }
function closePhotoViewer() { $('photoViewer').classList.remove('open'); $('fullSizePhoto').removeAttribute('src'); }

$('zoomInButton').addEventListener('click', () => zoomAt(1.12)); $('zoomOutButton').addEventListener('click', () => zoomAt(.89));
$('fitButton').addEventListener('click', () => { view = { ...view, x: 35, y: 42, scale: .76 }; applyView(); });
$('searchInput').addEventListener('input', renderNodes);
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$('addPersonButton').addEventListener('click', openPersonModal); $('contentAddButton').addEventListener('click', openPersonModal); $('addRelationButton').addEventListener('click', openPersonModal);
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closePersonModal)); $('personModal').addEventListener('click', (event) => { if (event.target === $('personModal')) closePersonModal(); });
$('personForm').addEventListener('submit', (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget), name = data.get('name').trim(), selected = person(state.selectedId) || state.nodes[0], relation = data.get('relation'), id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const x = selected.x + (relation === 'partner' ? 240 : relation === 'sibling' ? 210 : 0), y = selected.y + (relation === 'parent' ? -190 : relation === 'child' ? 195 : 0);
  state.nodes.push({ id, name, birth: data.get('birth').trim(), death: '', location: data.get('location').trim(), about: '', x, y, clan: selected.clan, color: ['mint', 'coral', 'yellow', 'lavender'][state.nodes.length % 4] });
  if (relation === 'parent') state.relations.push([id, selected.id, 'parent']); else if (relation === 'child') state.relations.push([selected.id, id, 'parent']); else state.relations.push([selected.id, id, relation]);
  state.selectedId = id; snapshot(); event.currentTarget.reset(); closePersonModal(); setView('tree'); render(); toast(`${name} added to your tree`);
});
$('saveDetails').addEventListener('click', () => { const item = person(state.selectedId); Object.assign(item, { name: $('detailName').value.trim() || item.name, birth: $('detailBirth').value.trim(), death: $('detailDeath').value.trim(), location: $('detailLocation').value.trim(), about: $('detailAbout').value.trim() }); snapshot(); render(); toast('Details saved locally'); });
$('saveNotes').addEventListener('click', () => { person(state.selectedId).notes = $('detailNotes').value.trim(); snapshot(); toast('Notes saved locally'); });
$('saveSources').addEventListener('click', () => { person(state.selectedId).sources = $('detailSources').value.trim(); snapshot(); toast('Sources saved locally'); });
$('deletePerson').addEventListener('click', () => { if (state.nodes.length <= 1) return toast('Your tree needs at least one person'); if (!confirm('Remove this person and their connections?')) return; const removed = state.selectedId; state.nodes = state.nodes.filter((n) => n.id !== removed); state.relations = state.relations.filter((r) => r[0] !== removed && r[1] !== removed); state.selectedId = state.nodes[0].id; snapshot(); render(); toast('Person removed'); });
$('photoUploadButton').addEventListener('click', () => $('photoInput').click()); $('photoInput').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; if (!file.type.startsWith('image/')) return toast('Please choose an image file'); if (file.size > 2_000_000) return toast('Please choose an image under 2 MB'); const reader = new FileReader(); reader.onload = () => { person(state.selectedId).photo = reader.result; snapshot(); render(); toast('Portrait updated'); }; reader.readAsDataURL(file); event.target.value = ''; });
$('profilePhoto').addEventListener('click', () => { const selected = person(state.selectedId); if (selected?.photo) openPhotoViewer(selected.photo, selected.name); });
$('nodeLayer').addEventListener('click', (event) => { const image = event.target.closest('.node-avatar img'); if (!image) return; event.stopPropagation(); const selected = person(image.closest('.node-card').dataset.id); openPhotoViewer(selected.photo, selected.name); });
$('contentBody').addEventListener('click', (event) => { const image = event.target.closest('.large-avatar img'); if (!image) return; event.stopPropagation(); const selected = person(image.closest('[data-person-id]').dataset.personId); openPhotoViewer(selected.photo, selected.name); });
$('closePhotoViewer').addEventListener('click', closePhotoViewer); $('photoViewer').addEventListener('click', (event) => { if (event.target === $('photoViewer')) closePhotoViewer(); });
$('exportButton').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'codyasbin-family-tree.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); toast('Tree exported'); });
$('importButton').addEventListener('click', () => $('importFile').click()); $('importFile').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(reader.result); if (!incoming.nodes?.every((n) => n.id && n.name && Number.isFinite(Number(n.x)) && Number.isFinite(Number(n.y))) || !Array.isArray(incoming.relations)) throw new Error(); state = normalizeState(incoming); history = [clone(state)]; historyIndex = 0; saveState(); render(); toast('Tree imported'); } catch { toast('That file could not be imported'); } }; reader.readAsText(file); event.target.value = ''; });
$('layoutButton').addEventListener('click', () => { const levels = {}; state.nodes.forEach((node) => { const year = Number(node.birth) || 0, level = year ? Math.floor((year - 1900) / 25) : 0; (levels[level] ||= []).push(node); }); Object.values(levels).forEach((nodes, row) => nodes.forEach((node, col) => { node.x = 130 + col * 220; node.y = 160 + row * 190; })); snapshot(); render(); toast('Auto layout applied'); });
$('closeMinimap').addEventListener('click', () => $('minimap').classList.add('hidden'));
$('closeInspector').addEventListener('click', () => $('inspector').classList.add('hidden'));
$('undoButton').addEventListener('click', () => { if (historyIndex > 0) { state = clone(history[--historyIndex]); saveState(); render(); } }); $('redoButton').addEventListener('click', () => { if (historyIndex < history.length - 1) { state = clone(history[++historyIndex]); saveState(); render(); } });

document.querySelectorAll('.inspector-tabs button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.inspector-tabs button').forEach((item) => item.classList.toggle('active', item === button)); document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `${button.dataset.tab}Tab`; }); }));
$('familyName').addEventListener('click', () => { const open = $('familyMenu').classList.toggle('open'); $('familyName').setAttribute('aria-expanded', open); });
document.querySelectorAll('[data-family]').forEach((button) => button.addEventListener('click', () => { $('familyMenu').classList.remove('open'); $('familyName').setAttribute('aria-expanded', 'false'); toast(`${button.dataset.family} is already open`); }));
$('renameFamilyButton').addEventListener('click', () => { $('familyMenu').classList.remove('open'); $('settingsFamilyName').value = state.family; $('settingsModal').classList.add('open'); setTimeout(() => $('settingsFamilyName').select(), 30); });
$('settingsButton').addEventListener('click', () => { $('settingsFamilyName').value = state.family; $('showTips').checked = state.settings.showTips !== false; $('settingsModal').classList.add('open'); });
$('settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const previousFamily = state.family;
  const nextFamily = $('settingsFamilyName').value.trim() || previousFamily;
  state.family = nextFamily;
  state.nodes.forEach((node) => { if (node.clan === previousFamily || node.clan === defaultState.family) node.clan = nextFamily; });
  state.settings.showTips = $('showTips').checked;
  snapshot();
  $('settingsModal').classList.remove('open');
  render();
  toast('Family name updated across the tree');
});
document.querySelectorAll('[data-close-settings]').forEach((button) => button.addEventListener('click', () => $('settingsModal').classList.remove('open'))); $('settingsModal').addEventListener('click', (event) => { if (event.target === $('settingsModal')) $('settingsModal').classList.remove('open'); });
$('resetTree').addEventListener('click', () => { if (!confirm('Reset the tree to the original sample? Your current local tree will be replaced.')) return; state = clone(defaultState); history = [clone(state)]; historyIndex = 0; saveState(); $('settingsModal').classList.remove('open'); setView('tree'); render(); toast('Sample tree restored'); });
$('mobileMenu').addEventListener('click', () => { $('sidebar').classList.add('mobile-open'); $('sidebarScrim').classList.add('open'); }); $('sidebarScrim').addEventListener('click', closeMobileNav);

function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 2200); }
window.addEventListener('keydown', (event) => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); setView('tree'); $('searchInput').focus(); } if (event.key === 'Escape') { closePhotoViewer(); closePersonModal(); $('settingsModal').classList.remove('open'); $('familyMenu').classList.remove('open'); closeMobileNav(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); (event.shiftKey ? $('redoButton') : $('undoButton')).click(); } });
document.addEventListener('click', (event) => { if (!event.target.closest('.family-switcher')) { $('familyMenu').classList.remove('open'); $('familyName').setAttribute('aria-expanded', 'false'); } });

render();

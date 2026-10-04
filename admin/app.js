import {
  ROLES, STATUSES, UNIT_TYPES, seedState, checkImport,
  unitById, userById, childUnits, rootUnit, unitSubtree, reportSubtree, unitPath,
  saveUser, deleteUser, saveUnit, deleteUnit,
} from './store.js';

const STORAGE_KEY = 'admin-console-state-v1';
const $ = (sel) => document.querySelector(sel);

let state = load();
const collapsed = new Set();

function load() {
  try {
    const doc = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (doc && !checkImport(doc)) return doc;
  } catch { /* fall through to demo data */ }
  return seedState();
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function commit(message) {
  persist();
  render();
  if (message) toast(message);
}

// ---- Helpers ---------------------------------------------------------------

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function options(items, selected, { blank } = {}) {
  const head = blank ? `<option value="">${esc(blank)}</option>` : '';
  return head + items.map(([value, label]) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

// Units in tree order, labelled with indentation so the hierarchy shows in a <select>.
function unitOptions(exclude = []) {
  const out = [];
  const walk = (unit, depth) => {
    if (exclude.includes(unit.id)) return;
    out.push([unit.id, `${' '.repeat(depth)}${unit.name}`]);
    for (const c of childUnits(state, unit.id)) walk(c, depth + 1);
  };
  walk(rootUnit(state), 0);
  return out;
}

function userOptions(exclude = []) {
  return [...state.users]
    .filter((u) => !exclude.includes(u.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => [u.id, u.title ? `${u.name} — ${u.title}` : u.name]);
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showErrors(form, errors) {
  for (const small of form.querySelectorAll('.err')) {
    const msg = errors[small.dataset.for] || '';
    small.textContent = msg;
    form.elements[small.dataset.for]?.classList.toggle('invalid', Boolean(msg));
  }
  const first = Object.keys(errors)[0];
  if (first) form.elements[first]?.focus();
}

// ---- Rendering -------------------------------------------------------------

function render() {
  $('#org-name').textContent = rootUnit(state).name;
  $('#count-users').textContent = state.users.length;
  $('#count-units').textContent = state.units.length;
  renderFilters();
  renderUsers();
  renderUnits();
  renderChart();
}

function renderFilters() {
  const unitSel = $('#user-unit-filter');
  const roleSel = $('#user-role-filter');
  const unitVal = unitById(state, unitSel.value) ? unitSel.value : '';
  unitSel.innerHTML = options(unitOptions(), unitVal, { blank: 'All units' });
  roleSel.innerHTML = options(ROLES.map((r) => [r, r]), roleSel.value, { blank: 'All roles' });
}

function renderUsers() {
  const q = $('#user-search').value.trim().toLowerCase();
  const unitFilter = $('#user-unit-filter').value;
  const roleFilter = $('#user-role-filter').value;
  const inUnits = unitFilter ? new Set(unitSubtree(state, unitFilter)) : null;

  const rows = state.users
    .filter((u) => !q || [u.name, u.email, u.title].some((f) => f.toLowerCase().includes(q)))
    .filter((u) => !inUnits || inUnits.has(u.unitId))
    .filter((u) => !roleFilter || u.role === roleFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  $('#user-rows').innerHTML = rows.map((u) => {
    const manager = userById(state, u.managerId);
    return `<tr>
      <td><div class="person"><span class="avatar">${esc(initials(u.name))}</span>
        <div>${esc(u.name)}<small>${esc(u.email)}${u.title ? ' · ' + esc(u.title) : ''}</small></div></div></td>
      <td><span class="badge ${esc(u.role)}">${esc(u.role)}</span></td>
      <td title="${esc(unitPath(state, u.unitId))}">${esc(unitById(state, u.unitId)?.name)}</td>
      <td>${manager ? esc(manager.name) : '<span class="muted">—</span>'}</td>
      <td><span class="badge ${esc(u.status)}">${esc(u.status)}</span></td>
      <td class="row-actions">
        <button class="btn small" data-action="edit-user" data-id="${esc(u.id)}">Edit</button>
        <button class="btn small danger" data-action="delete-user" data-id="${esc(u.id)}">Delete</button>
      </td>
    </tr>`;
  }).join('');
  $('#user-empty').hidden = rows.length > 0;
}

function renderUnits() {
  const node = (unit) => {
    const kids = childUnits(state, unit.id);
    const head = userById(state, unit.headId);
    const members = state.users.filter((u) => u.unitId === unit.id).length;
    const total = state.users.filter((u) => unitSubtree(state, unit.id).includes(u.unitId)).length;
    const open = !collapsed.has(unit.id);
    const isRoot = unit.parentId === null;
    return `<li>
      <div class="node">
        <div class="node-main">
          <button class="toggle" data-action="toggle-unit" data-id="${esc(unit.id)}" aria-label="${open ? 'Collapse' : 'Expand'}"
            aria-expanded="${open}" ${kids.length ? '' : 'disabled'}>${open ? '▼' : '▶'}</button>
          <div>
            <span class="node-title">${esc(unit.name)}</span> <span class="type">${esc(unit.type)}</span>
            <div class="node-meta">Head: ${head ? esc(head.name) : 'unassigned'} · ${members} direct member${members === 1 ? '' : 's'} · ${total} in total</div>
          </div>
        </div>
        <div class="row-actions">
          <button class="btn small" data-action="add-subunit" data-id="${esc(unit.id)}">+ Sub-unit</button>
          <button class="btn small" data-action="add-member" data-id="${esc(unit.id)}">+ Member</button>
          <button class="btn small" data-action="edit-unit" data-id="${esc(unit.id)}">Edit</button>
          ${isRoot ? '' : `<button class="btn small danger" data-action="delete-unit" data-id="${esc(unit.id)}">Delete</button>`}
        </div>
      </div>
      ${kids.length && open ? `<ul>${kids.map(node).join('')}</ul>` : ''}
    </li>`;
  };
  $('#unit-tree').innerHTML = node(rootUnit(state));
}

function renderChart() {
  const card = (u) => {
    const reports = state.users.filter((r) => r.managerId === u.id).sort((a, b) => a.name.localeCompare(b.name));
    return `<li>
      <div class="card" data-action="edit-user" data-id="${esc(u.id)}" tabindex="0" role="button">
        <span class="avatar">${esc(initials(u.name))}</span>
        <strong>${esc(u.name)}</strong>
        <small>${esc(u.title || u.role)}</small>
        <small>${esc(unitById(state, u.unitId)?.name)}</small>
      </div>
      ${reports.length ? `<ul>${reports.map(card).join('')}</ul>` : ''}
    </li>`;
  };
  const tops = state.users.filter((u) => !u.managerId).sort((a, b) => a.name.localeCompare(b.name));
  $('#report-chart').innerHTML = tops.length
    ? tops.map((u) => `<ul>${card(u)}</ul>`).join('')
    : '<p class="empty">No users yet.</p>';
}

// ---- User dialog -----------------------------------------------------------

let editingUserId = null;

function openUserDialog(id = null, preset = {}) {
  editingUserId = id;
  const user = id ? userById(state, id) : null;
  const data = user || { name: '', email: '', title: '', role: 'Member', status: 'Active', unitId: rootUnit(state).id, managerId: null, ...preset };
  const form = $('#user-form');
  $('#user-dialog-title').textContent = user ? `Edit ${user.name}` : 'New user';
  form.elements.name.value = data.name;
  form.elements.email.value = data.email;
  form.elements.title.value = data.title;
  form.elements.role.innerHTML = options(ROLES.map((r) => [r, r]), data.role);
  form.elements.status.innerHTML = options(STATUSES.map((s) => [s, s]), data.status);
  form.elements.unitId.innerHTML = options(unitOptions(), data.unitId);
  // Can't report to yourself or to anyone already under you.
  const exclude = id ? reportSubtree(state, id) : [];
  form.elements.managerId.innerHTML = options(userOptions(exclude), data.managerId, { blank: 'No manager (top level)' });
  showErrors(form, {});
  $('#user-dialog').showModal();
  form.elements.name.focus();
}

$('#user-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const res = saveUser(state, data, editingUserId);
  if (res.errors) return showErrors(form, res.errors);
  $('#user-dialog').close();
  commit(editingUserId ? 'User updated.' : `${data.name.trim()} added.`);
});

// ---- Unit dialog -----------------------------------------------------------

let editingUnitId = null;

function openUnitDialog(id = null, parentId = null) {
  editingUnitId = id;
  const unit = id ? unitById(state, id) : null;
  const parent = unitById(state, parentId) || rootUnit(state);
  const nextType = UNIT_TYPES[Math.min(UNIT_TYPES.indexOf(parent.type) + 1, UNIT_TYPES.length - 1)];
  const data = unit || { name: '', type: nextType, parentId: parent.id, headId: null };
  const form = $('#unit-form');
  $('#unit-dialog-title').textContent = unit ? `Edit ${unit.name}` : 'New unit';
  form.elements.name.value = data.name;
  form.elements.type.innerHTML = options(UNIT_TYPES.map((t) => [t, t]), data.type);
  const isRoot = unit && unit.parentId === null;
  form.elements.parentId.innerHTML = isRoot
    ? '<option value="">— (top level)</option>'
    : options(unitOptions(id ? unitSubtree(state, id) : []), data.parentId);
  form.elements.parentId.disabled = Boolean(isRoot);
  form.elements.headId.innerHTML = options(userOptions(), data.headId, { blank: 'Unassigned' });
  showErrors(form, {});
  $('#unit-dialog').showModal();
  form.elements.name.focus();
}

$('#unit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  if (form.elements.parentId.disabled) data.parentId = null;
  const res = saveUnit(state, data, editingUnitId);
  if (res.errors) return showErrors(form, res.errors);
  $('#unit-dialog').close();
  commit(editingUnitId ? 'Unit updated.' : `${data.name.trim()} created.`);
});

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

// ---- Actions ---------------------------------------------------------------

const actions = {
  'edit-user': (id) => openUserDialog(id),
  'delete-user': (id) => {
    const u = userById(state, id);
    const reports = state.users.filter((r) => r.managerId === id).length;
    const note = reports ? `\n\nTheir ${reports} direct report${reports === 1 ? '' : 's'} will move up to their manager.` : '';
    if (!confirm(`Delete ${u.name}?${note}`)) return;
    deleteUser(state, id);
    commit(`${u.name} deleted.`);
  },
  'toggle-unit': (id) => {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    renderUnits();
  },
  'add-subunit': (id) => openUnitDialog(null, id),
  'add-member': (id) => openUserDialog(null, { unitId: id, managerId: unitById(state, id)?.headId ?? null }),
  'edit-unit': (id) => openUnitDialog(id),
  'delete-unit': (id) => {
    const unit = unitById(state, id);
    const parent = unitById(state, unit.parentId);
    if (!confirm(`Delete "${unit.name}"?\n\nIts sub-units and members will move to "${parent.name}".`)) return;
    const res = deleteUnit(state, id);
    if (res.error) return toast(res.error);
    commit(`${unit.name} deleted.`);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

// ---- Tabs, filters, toolbar ------------------------------------------------

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `panel-${name}`;
  try { localStorage.setItem(`${STORAGE_KEY}-tab`, name); } catch { /* ignore */ }
}
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => selectTab(tab.dataset.tab));

$('#user-search').addEventListener('input', renderUsers);
$('#user-unit-filter').addEventListener('change', renderUsers);
$('#user-role-filter').addEventListener('change', renderUsers);
$('#btn-new-user').addEventListener('click', () => openUserDialog());
$('#btn-new-unit').addEventListener('click', () => openUnitDialog());

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `org-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const doc = JSON.parse(await file.text());
    const problem = checkImport(doc);
    if (problem) return toast(`Import failed: ${problem}`);
    if (!confirm(`Replace current data with ${doc.users.length} users and ${doc.units.length} units from "${file.name}"?`)) return;
    state = doc;
    commit('Data imported.');
  } catch {
    toast('Import failed: not a valid JSON file.');
  }
});

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Discard all changes and restore the demo organization?')) return;
  state = seedState();
  collapsed.clear();
  commit('Demo data restored.');
});

let savedTab = 'users';
try { savedTab = localStorage.getItem(`${STORAGE_KEY}-tab`) || 'users'; } catch { /* ignore */ }
selectTab(['users', 'units', 'chart'].includes(savedTab) ? savedTab : 'users');
render();

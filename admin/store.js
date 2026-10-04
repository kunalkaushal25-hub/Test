// Pure data layer for the admin console: org units, users, and the rules
// that keep the hierarchy consistent. No DOM access, so it runs under Node too.

export const ROLES = ['Admin', 'Manager', 'Member'];
export const STATUSES = ['Active', 'Invited', 'Suspended'];
export const UNIT_TYPES = ['Company', 'Division', 'Department', 'Team'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyState() {
  const root = { id: 'unit_root', name: 'Organization', type: 'Company', parentId: null, headId: null };
  return { units: [root], users: [] };
}

export function seedState() {
  const s = emptyState();
  s.units[0].name = 'Acme Holdings';
  const u = (id, name, type, parentId) => ({ id, name, type, parentId, headId: null });
  s.units.push(
    u('unit_ops', 'Operations', 'Division', 'unit_root'),
    u('unit_tech', 'Technology', 'Division', 'unit_root'),
    u('unit_sales', 'Sales', 'Department', 'unit_ops'),
    u('unit_eng', 'Engineering', 'Department', 'unit_tech'),
    u('unit_platform', 'Platform Team', 'Team', 'unit_eng'),
  );
  const p = (id, name, email, title, role, unitId, managerId) =>
    ({ id, name, email, title, role, status: 'Active', unitId, managerId });
  s.users.push(
    p('user_ceo', 'Jordan Lee', 'jordan.lee@example.com', 'Chief Executive Officer', 'Admin', 'unit_root', null),
    p('user_coo', 'Sam Patel', 'sam.patel@example.com', 'Chief Operating Officer', 'Manager', 'unit_ops', 'user_ceo'),
    p('user_cto', 'Alex Kim', 'alex.kim@example.com', 'Chief Technology Officer', 'Manager', 'unit_tech', 'user_ceo'),
    p('user_eng', 'Riley Chen', 'riley.chen@example.com', 'Engineering Manager', 'Manager', 'unit_eng', 'user_cto'),
    p('user_dev', 'Morgan Diaz', 'morgan.diaz@example.com', 'Software Engineer', 'Member', 'unit_platform', 'user_eng'),
  );
  const head = { unit_root: 'user_ceo', unit_ops: 'user_coo', unit_tech: 'user_cto', unit_eng: 'user_eng' };
  for (const unit of s.units) unit.headId = head[unit.id] ?? null;
  return s;
}

export const unitById = (s, id) => s.units.find((u) => u.id === id) || null;
export const userById = (s, id) => s.users.find((u) => u.id === id) || null;
export const childUnits = (s, id) => s.units.filter((u) => u.parentId === id);
export const rootUnit = (s) => s.units.find((u) => u.parentId === null);

// Ids of `id` and everything beneath it.
export function unitSubtree(s, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of childUnits(s, out[i])) out.push(c.id);
  return out;
}

// Ids of `id` and everyone who reports to them, directly or indirectly.
export function reportSubtree(s, id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const u of s.users) if (u.managerId === out[i]) out.push(u.id);
  return out;
}

export function unitPath(s, id) {
  const names = [];
  for (let u = unitById(s, id); u; u = unitById(s, u.parentId)) names.unshift(u.name);
  return names.join(' › ');
}

// ---- Units -----------------------------------------------------------------

export function validateUnit(s, data, id = null) {
  const errors = {};
  const name = (data.name || '').trim();
  if (!name) errors.name = 'Name is required.';
  else if (s.units.some((u) => u.id !== id && u.parentId === data.parentId && u.name.toLowerCase() === name.toLowerCase()))
    errors.name = 'A unit with this name already exists here.';
  if (!UNIT_TYPES.includes(data.type)) errors.type = 'Pick a unit type.';

  const isRoot = id && unitById(s, id)?.parentId === null;
  if (isRoot) {
    if (data.parentId) errors.parentId = 'The top-level unit cannot be moved.';
  } else if (!unitById(s, data.parentId)) {
    errors.parentId = 'Pick a parent unit.';
  } else if (id && unitSubtree(s, id).includes(data.parentId)) {
    errors.parentId = 'A unit cannot sit under itself or one of its own sub-units.';
  }
  if (data.headId && !userById(s, data.headId)) errors.headId = 'Unknown user.';
  return errors;
}

export function saveUnit(s, data, id = null) {
  const errors = validateUnit(s, data, id);
  if (Object.keys(errors).length) return { errors };
  const clean = { name: data.name.trim(), type: data.type, parentId: data.parentId || null, headId: data.headId || null };
  if (id) Object.assign(unitById(s, id), clean);
  else s.units.push({ id: newId('unit'), ...clean });
  return { ok: true };
}

// Deleting moves sub-units and members up to the parent, so nothing is orphaned.
export function deleteUnit(s, id) {
  const unit = unitById(s, id);
  if (!unit) return { error: 'Unknown unit.' };
  if (unit.parentId === null) return { error: 'The top-level unit cannot be deleted.' };
  for (const c of childUnits(s, id)) c.parentId = unit.parentId;
  for (const u of s.users) if (u.unitId === id) u.unitId = unit.parentId;
  s.units = s.units.filter((u) => u.id !== id);
  return { ok: true };
}

// ---- Users -----------------------------------------------------------------

export function validateUser(s, data, id = null) {
  const errors = {};
  if (!(data.name || '').trim()) errors.name = 'Name is required.';
  const email = (data.email || '').trim().toLowerCase();
  if (!email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  else if (s.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) errors.email = 'This email is already in use.';
  if (!ROLES.includes(data.role)) errors.role = 'Pick a role.';
  if (!STATUSES.includes(data.status)) errors.status = 'Pick a status.';
  if (!unitById(s, data.unitId)) errors.unitId = 'Pick an org unit.';
  if (data.managerId) {
    if (!userById(s, data.managerId)) errors.managerId = 'Unknown manager.';
    else if (id && reportSubtree(s, id).includes(data.managerId))
      errors.managerId = 'A user cannot report to themselves or to someone who reports to them.';
  }
  return errors;
}

export function saveUser(s, data, id = null) {
  const errors = validateUser(s, data, id);
  if (Object.keys(errors).length) return { errors };
  const clean = {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    title: (data.title || '').trim(),
    role: data.role,
    status: data.status,
    unitId: data.unitId,
    managerId: data.managerId || null,
  };
  if (id) Object.assign(userById(s, id), clean);
  else s.users.push({ id: newId('user'), ...clean });
  return { ok: true };
}

// Direct reports move up to the deleted user's manager; units they headed lose their head.
export function deleteUser(s, id) {
  const user = userById(s, id);
  if (!user) return { error: 'Unknown user.' };
  for (const u of s.users) if (u.managerId === id) u.managerId = user.managerId;
  for (const unit of s.units) if (unit.headId === id) unit.headId = null;
  s.users = s.users.filter((u) => u.id !== id);
  return { ok: true };
}

// ---- Import ----------------------------------------------------------------

// Checks a parsed JSON document before it replaces the current state.
export function checkImport(doc) {
  if (!doc || !Array.isArray(doc.units) || !Array.isArray(doc.users)) return 'File must contain "units" and "users" arrays.';
  const roots = doc.units.filter((u) => u.parentId === null);
  if (roots.length !== 1) return 'There must be exactly one top-level unit (parentId: null).';
  const ids = new Set(doc.units.map((u) => u.id));
  if (ids.size !== doc.units.length) return 'Unit ids must be unique.';
  for (const u of doc.units) if (u.parentId !== null && !ids.has(u.parentId)) return `Unit "${u.name}" has an unknown parent.`;
  const reached = new Set(unitSubtree(doc, roots[0].id));
  if (reached.size !== doc.units.length) return 'Unit hierarchy contains a cycle.';
  const userIds = new Set(doc.users.map((u) => u.id));
  if (userIds.size !== doc.users.length) return 'User ids must be unique.';
  for (const u of doc.users) {
    if (!ids.has(u.unitId)) return `User "${u.name}" belongs to an unknown unit.`;
    if (u.managerId && !userIds.has(u.managerId)) return `User "${u.name}" has an unknown manager.`;
  }
  for (const u of doc.users) {
    const seen = new Set();
    for (let m = u; m && m.managerId; m = doc.users.find((x) => x.id === m.managerId)) {
      if (seen.has(m.id)) return 'Reporting lines contain a cycle.';
      seen.add(m.id);
    }
  }
  return null;
}

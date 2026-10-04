import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, saveUser, deleteUser, saveUnit, deleteUnit, checkImport, userById, unitById } from './store.js';

const base = { name: 'New Person', email: 'new@example.com', title: '', role: 'Member', status: 'Active', unitId: 'unit_eng', managerId: 'user_eng' };

test('creates a user and normalises email', () => {
  const s = seedState();
  assert.ok(saveUser(s, { ...base, email: ' New@Example.com ' }).ok);
  assert.equal(s.users.at(-1).email, 'new@example.com');
});

test('rejects duplicate and malformed emails', () => {
  const s = seedState();
  assert.ok(saveUser(s, { ...base, email: 'JORDAN.LEE@example.com' }).errors.email);
  assert.ok(saveUser(s, { ...base, email: 'nope' }).errors.email);
});

test('rejects reporting cycles', () => {
  const s = seedState();
  const ceo = userById(s, 'user_ceo');
  assert.ok(saveUser(s, { ...ceo, managerId: 'user_dev' }, 'user_ceo').errors.managerId);
  assert.ok(saveUser(s, { ...ceo, managerId: 'user_ceo' }, 'user_ceo').errors.managerId);
});

test('deleting a user re-parents reports and clears unit head', () => {
  const s = seedState();
  deleteUser(s, 'user_eng');
  assert.equal(userById(s, 'user_dev').managerId, 'user_cto');
  assert.equal(unitById(s, 'unit_eng').headId, null);
});

test('rejects unit cycles and duplicate sibling names', () => {
  const s = seedState();
  const tech = unitById(s, 'unit_tech');
  assert.ok(saveUnit(s, { ...tech, parentId: 'unit_platform' }, 'unit_tech').errors.parentId);
  assert.ok(saveUnit(s, { name: 'operations', type: 'Division', parentId: 'unit_root' }).errors.name);
  assert.ok(saveUnit(s, { name: 'Finance', type: 'Division', parentId: 'unit_root' }).ok);
});

test('root unit cannot be moved or deleted', () => {
  const s = seedState();
  assert.ok(saveUnit(s, { ...unitById(s, 'unit_root'), parentId: 'unit_ops' }, 'unit_root').errors.parentId);
  assert.ok(deleteUnit(s, 'unit_root').error);
});

test('deleting a unit moves children and members up', () => {
  const s = seedState();
  deleteUnit(s, 'unit_eng');
  assert.equal(unitById(s, 'unit_platform').parentId, 'unit_tech');
  assert.equal(userById(s, 'user_eng').unitId, 'unit_tech');
});

test('import check catches broken documents', () => {
  assert.equal(checkImport(seedState()), null);
  assert.ok(checkImport({}));
  const s = seedState();
  userById(s, 'user_ceo').managerId = 'user_dev';
  assert.match(checkImport(s), /cycle/);
  const t = seedState();
  unitById(t, 'unit_root').parentId = 'unit_tech';
  assert.ok(checkImport(t));
});

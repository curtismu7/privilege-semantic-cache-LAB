import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedExtraHosts, assertBindAllowed, bindHost, hostOf, isLoopbackHost, resolvePort } from '../src/safety.js';

test('loopback bind only, unless PSC_BIND is set on purpose', () => {
  assert.equal(bindHost({}), '127.0.0.1');
  assert.equal(assertBindAllowed('127.0.0.1', {}), '127.0.0.1');
  assert.equal(assertBindAllowed('::1', {}), '::1');
  for (const h of ['0.0.0.0', '::', '192.0.2.1', 'evil.example']) assert.throws(() => assertBindAllowed(h, {}), /loopback only/, h);
  assert.equal(assertBindAllowed('0.0.0.0', { PSC_BIND: '0.0.0.0' }), '0.0.0.0');
});

test('the provisional port is 7847; PORT is validated and reserved ports refused', () => {
  assert.equal(resolvePort({}), 7847);
  assert.equal(resolvePort({ PORT: '7900' }), 7900);
  assert.equal(resolvePort({ PORT: '7800' }), 7800); assert.equal(resolvePort({ PORT: '7999' }), 7999);
  for (const p of ['abc', '12', '99999', '1.5', '8080', '4400', '5173', '1024', '7799', '8000', '65535']) assert.throws(() => resolvePort({ PORT: p }), p);
});

test('loopback and Host parsing', () => {
  for (const h of ['localhost', '127.0.0.1', '127.9.9.9', '[::1]', '::1']) assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['127.0.0.1.evil.example', '128.0.0.1', 'evil.example', '127.0.0.256']) assert.equal(isLoopbackHost(h), false, h);
  assert.equal(hostOf('localhost:7847'), 'localhost');
  assert.equal(hostOf('[::1]:7847'), '[::1]');
  for (const h of ['[::1]evil', 'a b', '', 'a:b:c']) assert.equal(hostOf(h), null, h);
});

test('LAB_ALLOWED_HOSTS rejects what is not a host name', () => {
  assert.deepEqual([...allowedExtraHosts({ LAB_ALLOWED_HOSTS: 'a.example, B.example' })], ['a.example', 'b.example']);
  assert.throws(() => allowedExtraHosts({ LAB_ALLOWED_HOSTS: 'a b' }), /not a host name/);
  assert.throws(() => allowedExtraHosts({ LAB_ALLOWED_HOSTS: 'x/../y' }), /not a host name/);
});

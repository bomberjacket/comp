import type net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { askHelper } from './client';
import { HELPER_PROTOCOL_VERSION } from './protocol';
import { handleRequest, startHelperServer, type HelperRunners } from './server';

const runners: HelperRunners = {
  auditpol: () =>
    'Machine Name,Policy Target,Subcategory,Subcategory GUID,Inclusion Setting,Exclusion Setting\r\nLT,System,Logon,{g},Success and Failure,\r\n',
  smb1Feature: () => {
    throw new Error('Get-WindowsOptionalFeature: elevation required');
  },
};
const opts = { version: '1.2.3', elevated: true, runners };

describe('handleRequest', () => {
  it('answers known commands and reports runner failures without throwing', () => {
    expect(handleRequest('{"command":"ping"}', opts)).toMatchObject({
      ok: true,
      output: 'pong',
      elevated: true,
      version: '1.2.3',
      protocol: HELPER_PROTOCOL_VERSION,
    });
    expect(handleRequest('{"command":"auditpol"}', opts).output).toContain('Logon');
    const failed = handleRequest('{"command":"smb1-feature"}', opts);
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('elevation required');
  });

  it('rejects unknown commands and malformed requests', () => {
    expect(handleRequest('{"command":"Remove-Item"}', opts)).toMatchObject({
      ok: false,
      error: 'unknown command',
    });
    expect(handleRequest('not json', opts)).toMatchObject({
      ok: false,
      error: 'request is not JSON',
    });
    expect(handleRequest('{"command":{"$":"x"}}', opts).ok).toBe(false);
  });
});

describe('named pipe round trip', () => {
  const pipe =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\compai-helper-test-${process.pid}`
      : `/tmp/compai-helper-test-${process.pid}.sock`;
  let server: net.Server;

  beforeAll(async () => {
    server = startHelperServer({ pipe, version: '1.2.3', elevated: false, runners });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delivers a response over the pipe and reports elevation state', async () => {
    const res = await askHelper('auditpol', { pipe, timeoutMs: 5000 });
    expect(res?.ok).toBe(true);
    expect(res?.elevated).toBe(false);
    expect(res?.output).toContain('Success and Failure');
  });

  it('resolves null when no helper is listening', async () => {
    const res = await askHelper('ping', { pipe: `${pipe}-missing`, timeoutMs: 2000 });
    expect(res).toBeNull();
  });
});

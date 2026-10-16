import { describe, expect, it } from 'vitest';
import { OPC_DOWNLOAD_URL, OPC_HOME_URL } from './links';

describe('MiniApp Market external links', () => {
  it('uses the official OPC-Team website and download pages', () => {
    expect(OPC_HOME_URL).toBe('https://opcteam.eu.cc/');
    expect(OPC_DOWNLOAD_URL).toBe('https://opcteam.eu.cc/download');
    expect(new URL(OPC_HOME_URL).protocol).toBe('https:');
    expect(new URL(OPC_DOWNLOAD_URL).protocol).toBe('https:');
  });
});

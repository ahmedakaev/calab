import { describe, expect, it } from 'vitest';
import { WebOriginError, parseWebOrigin, parseReleaseIdentity } from './config';

describe('parseWebOrigin', () => {
  it('accepts a bare https origin, with or without the trailing slash or a port', () => {
    expect(parseWebOrigin('https://calab.example.com')).toBe('https://calab.example.com');
    expect(parseWebOrigin(' https://calab.example.com/ ')).toBe('https://calab.example.com');
    expect(parseWebOrigin('https://calab.example.com:8443')).toBe('https://calab.example.com:8443');
  });

  it.each([
    [undefined, 'not set'],
    ['', 'not set'],
    ['calab.example.com', 'not a valid URL'],
    ['http://calab.example.com', 'https'],
    ['wss://calab.example.com', 'https'],
    ['javascript:alert(1)', 'https'],
    ['file:///etc/hosts', 'https'],
    ['data:text/html,x', 'https'],
    ['https://user:pass@calab.example.com', 'credentials'],
    ['https://user@calab.example.com', 'credentials'],
  ])('rejects %j (%s)', (raw, message) => {
    expect(() => parseWebOrigin(raw)).toThrow(WebOriginError);
    expect(() => parseWebOrigin(raw)).toThrow(message);
  });

  it.each([
    'https://calab.example.com/app',
    'https://calab.example.com/?next=/x',
    'https://calab.example.com/#x',
    'https://calab.example.com:443',
    'https://Calab.Example.com',
    'https:\\\\calab.example.com',
    'https://calab.exa\tmple.com',
  ])('rejects %j that the URL parser would rewrite or truncate', (raw) => {
    expect(() => parseWebOrigin(raw)).toThrow('bare origin');
  });
});

describe('parseReleaseIdentity', () => {
  it('defaults locally and preserves explicit distribution identity', () => {
    expect(parseReleaseIdentity()).toEqual({ version: '0.1.0', buildNumber: '1' });
    expect(parseReleaseIdentity('4.2.3', '21')).toEqual({ version: '4.2.3', buildNumber: '21' });
  });
  it.each(['', '1.2', 'v1.2.3', '1.2.3-beta', '1.2.3.4', '01.2.3', '1.2.3\n'])('rejects malformed version %j', (version) => {
    expect(() => parseReleaseIdentity(version, '21')).toThrow('CALAB_APP_VERSION');
  });
  it.each(['', '0', '-1', '01', '1.2', '1e3', '10000', '21\n'])('rejects malformed build %j', (build) => {
    expect(() => parseReleaseIdentity('1.2.3', build)).toThrow('CALAB_IOS_BUILD_NUMBER');
  });
});

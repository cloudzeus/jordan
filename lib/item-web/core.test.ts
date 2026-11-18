import { describe, expect, it } from 'vitest';
import { mergeAttributes, parseResearch, publicHttpsUrl, sameAttributes } from './core';
import { isPublicIPv4, pageImage } from './fetch';

describe('web product research', () => {
  const original = [{ name: 'Χρώμα', value: 'Λευκό', unit: null }, { name: 'Πάχος', value: '10', unit: 'mm' }];
  it('merges selected values without deleting unrelated existing attributes', () => {
    expect(mergeAttributes(original, [{ name: 'χρώμα', value: 'Μαύρο' }])).toEqual([{ name: 'χρώμα', value: 'Μαύρο' }, original[1]]);
  });
  it('rejects duplicate selected names after normalization', () => {
    expect(() => mergeAttributes([], [{ name: 'Χρώμα', value: 'Α' }, { name: ' χρώμα ', value: 'Β' }])).toThrow();
  });
  it('detects stale previews while ignoring database-only fields', () => {
    expect(sameAttributes(original, original.map((a) => ({ ...a, id: 'db-id' })))).toBe(true);
    expect(sameAttributes(original, [{ ...original[0], value: 'Μαύρο' }, original[1]])).toBe(false);
  });
  it('discards invented sources and duplicate model attributes', () => {
    const attr = { name: 'Πάχος', value: '10', unit: 'mm', evidence: '10 mm', sourceUrl: 'https://maker.example/product' };
    const result = parseResearch(JSON.stringify({ attributes: [attr, attr, { ...attr, name: 'Χρώμα', sourceUrl: 'https://invented.example/product' }] }), [{ url: attr.sourceUrl, title: 'Product' }]);
    expect(result.attributes).toEqual([attr]);
  });
  it('returns no suggestions without provider citations', () => {
    expect(parseResearch('{"attributes":[]}', []).attributes).toEqual([]);
  });
  it('rejects malformed or unsupported evidence', () => {
    expect(() => parseResearch('{"attributes":[{"name":"Πάχος","value":"10"}]}', [])).toThrow();
    expect(() => parseResearch('not json', [])).toThrow();
  });
  it.each(['javascript:alert(1)', 'http://maker.example/a', 'https://user:pass@maker.example/a', 'https://localhost/a', 'https://maker.example:8443/a'])('rejects unsafe URL %s', (url) => {
    expect(publicHttpsUrl(url)).toBeNull();
  });
  it.each(['127.0.0.1', '10.0.0.3', '169.254.169.254', '172.16.2.3', '192.168.1.1', '100.100.100.200', '0.0.0.0', '224.0.0.1'])('blocks nonpublic connection address %s', (address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });
  it('allows public IPv4 addresses', () => expect(isPublicIPv4('93.184.216.34')).toBe(true));
  it('extracts actual page metadata with relative URLs and entities', () => {
    expect(pageImage('<meta content="/photo.jpg?a=1&amp;b=2" property="og:image">', 'https://maker.example/product')).toBe('https://maker.example/photo.jpg?a=1&b=2');
    expect(pageImage('<meta name="twitter:image" content="https://cdn.example/a.png">', 'https://maker.example/product')).toBe('https://cdn.example/a.png');
    expect(pageImage('<meta property="og:image" content="javascript:alert(1)">', 'https://maker.example')).toBeNull();
    expect(pageImage('<p>No image</p>', 'https://maker.example')).toBeNull();
  });
});

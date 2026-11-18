import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/settings', () => ({ getSetting: vi.fn() }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('./fetch', () => ({ fetchPublic: vi.fn(), pageImage: vi.fn() }));
import { getSetting } from '@/lib/settings';
import { fetchPublic, pageImage } from './fetch';
import { researchItem } from './service';

const item = { mtrl: 1, name: 'Exact product', name2: null, code1: 'MODEL-1', code2: null };
const sourceUrl = 'https://manufacturer.example/product';
const attr = { name: 'Πάχος', value: '10', unit: 'mm', sourceUrl, evidence: 'Thickness: 10 mm' };

describe('web research provider boundary', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(getSetting).mockResolvedValue('test-key');
    vi.mocked(fetchPublic).mockResolvedValue({ buffer: Buffer.from('<html/>'), mime: 'text/html', url: sourceUrl });
    vi.mocked(pageImage).mockReturnValue('https://manufacturer.example/photo.jpg');
  });
  function respond(annotations: unknown[] = [{ type: 'url_citation', url_citation: { url: sourceUrl, title: 'Product' } }]) {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ attributes: [attr] }), annotations } }], usage: {} })));
  }
  it('enables real web search and derives images from cited pages', async () => {
    respond();
    const result = await researchItem(item, 'MODEL-1', 'user-1');
    const request = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(request.plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 5 }]);
    expect(result.attributes).toEqual([attr]);
    expect(result.images).toEqual([{ url: 'https://manufacturer.example/photo.jpg', sourceUrl, title: 'Product' }]);
  });
  it('does not present unsupported model answers as web findings', async () => {
    respond([]);
    const result = await researchItem(item, 'MODEL-1', 'user-1');
    expect(result.attributes).toEqual([]);
    expect(result.images).toEqual([]);
    expect(fetchPublic).not.toHaveBeenCalled();
  });
  it('preserves attributes when a source blocks image extraction', async () => {
    respond();
    vi.mocked(fetchPublic).mockRejectedValue(new Error('blocked'));
    const result = await researchItem(item, 'MODEL-1', 'user-1');
    expect(result.attributes).toEqual([attr]);
    expect(result.images).toEqual([]);
  });
  it('returns a safe error without leaking provider response bodies', async () => {
    mockFetch.mockResolvedValue(new Response('sensitive upstream details', { status: 402 }));
    await expect(researchItem(item, 'MODEL-1', 'user-1')).rejects.toThrow('402');
  });
});

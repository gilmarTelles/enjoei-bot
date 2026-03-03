const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

const { filterByRelevance, buildTextContent, buildVisionContent, isValidImageUrl, MAX_IMAGES } = require('../src/relevanceFilter');

const makeProducts = (n) =>
  Array.from({ length: n }, (_, i) => ({
    title: `Product ${i}`,
    image: `https://img.example.com/${i}.jpg`,
  }));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ENABLE_RELEVANCE_FILTER;
  delete process.env.ENABLE_IMAGE_FILTER;
});

describe('filterByRelevance', () => {
  test('filter disabled — returns all products', async () => {
    const products = makeProducts(3);
    const result = await filterByRelevance(products, 'nike');
    expect(result).toEqual(products);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('text-only mode — sends plain string content', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    mockCreate.mockResolvedValue({
      content: [{ text: '[0, 2]' }],
    });

    const products = makeProducts(3);
    const result = await filterByRelevance(products, 'nike');

    expect(result).toEqual([products[0], products[2]]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    expect(typeof call.messages[0].content).toBe('string');
    expect(call.messages[0].content).toContain('nike');
  });

  test('vision mode — sends content array with image blocks', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    process.env.ENABLE_IMAGE_FILTER = 'true';
    mockCreate.mockResolvedValue({
      content: [{ text: '[0, 1]' }],
    });

    const products = makeProducts(2);
    const result = await filterByRelevance(products, 'nike');

    expect(result).toEqual(products);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const imageBlocks = content.filter(b => b.type === 'image');
    expect(imageBlocks.length).toBe(2);
    expect(imageBlocks[0].source).toEqual({ type: 'url', url: 'https://img.example.com/0.jpg' });
  });

  test('vision fallback — retries with text-only on vision error', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    process.env.ENABLE_IMAGE_FILTER = 'true';
    mockCreate
      .mockRejectedValueOnce(new Error('vision failed'))
      .mockResolvedValueOnce({ content: [{ text: '[0]' }] });

    const products = makeProducts(2);
    const result = await filterByRelevance(products, 'nike');

    expect(result).toEqual([products[0]]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // Second call should be text-only
    const secondCall = mockCreate.mock.calls[1][0];
    expect(typeof secondCall.messages[0].content).toBe('string');
  });

  test('API error — returns all products', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    mockCreate.mockRejectedValue(new Error('api down'));

    const products = makeProducts(3);
    const result = await filterByRelevance(products, 'nike');
    expect(result).toEqual(products);
  });

  test('empty products — returns empty array', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    const result = await filterByRelevance([], 'nike');
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('non-array response — returns all products', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    mockCreate.mockResolvedValue({
      content: [{ text: '"not an array"' }],
    });

    const products = makeProducts(2);
    const result = await filterByRelevance(products, 'nike');
    expect(result).toEqual(products);
  });

  test('response wrapped in code fence — parsed correctly', async () => {
    process.env.ENABLE_RELEVANCE_FILTER = 'true';
    mockCreate.mockResolvedValue({
      content: [{ text: '```json\n[0]\n```' }],
    });

    const products = makeProducts(2);
    const result = await filterByRelevance(products, 'nike');
    expect(result).toEqual([products[0]]);
  });
});

describe('buildTextContent', () => {
  test('builds numbered product list', () => {
    const products = [{ title: 'A' }, { title: 'B' }];
    const result = buildTextContent(products, 'test');
    expect(result).toBe('Keyword: "test"\n\nProducts:\n0. A\n1. B');
  });
});

describe('buildVisionContent', () => {
  test('includes image blocks for valid URLs', () => {
    const products = [
      { title: 'A', image: 'https://img.example.com/a.jpg' },
      { title: 'B', image: 'https://img.example.com/b.jpg' },
    ];
    const result = buildVisionContent(products, 'test');
    expect(Array.isArray(result)).toBe(true);
    const imageBlocks = result.filter(b => b.type === 'image');
    expect(imageBlocks.length).toBe(2);
  });

  test('skips invalid image URLs', () => {
    const products = [
      { title: 'A', image: '' },
      { title: 'B', image: 'data:image/png;base64,abc' },
      { title: 'C', image: null },
      { title: 'D', image: 'https://img.example.com/d.jpg' },
    ];
    const result = buildVisionContent(products, 'test');
    const imageBlocks = result.filter(b => b.type === 'image');
    expect(imageBlocks.length).toBe(1);
    expect(imageBlocks[0].source.url).toBe('https://img.example.com/d.jpg');
  });

  test('caps images at MAX_IMAGES', () => {
    const products = makeProducts(25);
    const result = buildVisionContent(products, 'test');
    const imageBlocks = result.filter(b => b.type === 'image');
    expect(imageBlocks.length).toBe(MAX_IMAGES);
    // All 25 text entries should still be present
    const textBlocks = result.filter(b => b.type === 'text' && b.text.match(/^\d+\./));
    expect(textBlocks.length).toBe(25);
  });
});

describe('isValidImageUrl', () => {
  test('accepts valid http/https URLs', () => {
    expect(isValidImageUrl('https://img.example.com/a.jpg')).toBe(true);
    expect(isValidImageUrl('http://img.example.com/a.jpg')).toBe(true);
  });

  test('rejects empty/null/undefined', () => {
    expect(isValidImageUrl('')).toBe(false);
    expect(isValidImageUrl(null)).toBe(false);
    expect(isValidImageUrl(undefined)).toBe(false);
  });

  test('rejects data URIs', () => {
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(false);
  });

  test('rejects non-URL strings', () => {
    expect(isValidImageUrl('not a url')).toBe(false);
  });
});

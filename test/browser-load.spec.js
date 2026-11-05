import fs from 'fs';

const image = fs.readFileSync('test/images/rgb-8bit.png');
const response = image.buffer.slice(
  image.byteOffset,
  image.byteOffset + image.byteLength,
);
let request;

class MockXHR {
  constructor() {
    request = this;
  }

  open(method, url, async) {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  send(body) {
    this.body = body;
  }
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', MockXHR);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('standalone browser PNG.load', () => {
  test.each([200, 201])('resolves to a PNG for HTTP %s', async (status) => {
    const result = PNG.load('/image.png');
    expect(result).toBeInstanceOf(Promise);
    expect(request).toMatchObject({
      method: 'GET',
      url: '/image.png',
      async: true,
      responseType: 'arraybuffer',
      body: null,
    });
    request.status = status;
    request.response = response;
    request.onload();
    const png = await result;
    expect(png).toBeInstanceOf(PNG);
    expect(png.width).toBeGreaterThan(0);
  });

  test('renders to the optional canvas before resolving', async () => {
    const canvas = { getContext() {} };
    const render = vi
      .spyOn(PNG.prototype, 'render')
      .mockImplementation(() => {});
    const result = PNG.load('/image.png', canvas);
    request.status = 200;
    request.response = response;
    request.onload();
    const png = await result;
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.instances[0]).toBe(png);
    expect(render).toHaveBeenCalledWith(canvas);
  });

  test.each([0, 404, 500])('rejects HTTP status %s', async (status) => {
    const result = PNG.load('/image.png');
    request.status = status;
    request.onload();
    await expect(result).rejects.toThrow(`HTTP ${status}`);
  });

  test.each([
    ['onerror', 'network error'],
    ['onabort', 'request aborted'],
    ['ontimeout', 'request timed out'],
  ])('rejects %s', async (event, message) => {
    const result = PNG.load('/image.png');
    request[event]();
    await expect(result).rejects.toThrow(message);
  });

  test('rejects an empty response', async () => {
    const result = PNG.load('/image.png');
    request.status = 200;
    request.onload();
    await expect(result).rejects.toThrow('empty response');
  });

  test('rejects synchronous request setup errors', async () => {
    const error = new Error('send failed');
    vi.spyOn(MockXHR.prototype, 'send').mockImplementation(() => {
      throw error;
    });
    await expect(PNG.load('/image.png')).rejects.toBe(error);
  });

  test('rejects parsing errors', async () => {
    const error = new Error('parse failed');
    vi.spyOn(PNG.prototype, 'readUInt32').mockImplementation(() => {
      throw error;
    });
    const result = PNG.load('/image.png');
    request.status = 200;
    request.response = response;
    request.onload();
    await expect(result).rejects.toBe(error);
  });

  test('rejects rendering errors', async () => {
    const error = new Error('render failed');
    vi.spyOn(PNG.prototype, 'render').mockImplementation(() => {
      throw error;
    });
    const result = PNG.load('/image.png', { getContext() {} });
    request.status = 200;
    request.response = response;
    request.onload();
    await expect(result).rejects.toBe(error);
  });
});

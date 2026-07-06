import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLLMReport } from '../llmProxy';

describe('llmProxy', () => {
  beforeEach(() => {
    // Reset global fetch mock
    vi.restoreAllMocks();
  });

  it('should throw error if apiKey is missing', async () => {
    await expect(
      generateLLMReport('test prompt', { provider: 'gemini', apiKey: '', modelName: 'test-model' })
    ).rejects.toThrow('Missing API Key for LLM provider');
  });

  it('should correctly call Gemini API and return text', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Gemini simulated response' }]
          }
        }
      ]
    };

    const globalFetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })
    );
    vi.stubGlobal('fetch', globalFetchMock);

    const result = await generateLLMReport('hello gemini', {
      provider: 'gemini',
      apiKey: 'test-key',
      modelName: 'gemini-1.5-flash'
    });

    expect(globalFetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = globalFetchMock.mock.calls[0];

    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('gemini-1.5-flash');
    // API key must travel in a header, never in the query string (avoids proxy/access-log leaks)
    expect(calledUrl).not.toContain('test-key');
    expect(calledInit.headers['x-goog-api-key']).toBe('test-key');

    const body = JSON.parse(calledInit.body);
    expect(body.contents[0].parts[0].text).toBe('hello gemini');
    expect(result).toBe('Gemini simulated response');
  });

  it('should throw error if Gemini API returns non-ok status', async () => {
    const globalFetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid request payload')
      })
    );
    vi.stubGlobal('fetch', globalFetchMock);

    await expect(
      generateLLMReport('hello gemini', {
        provider: 'gemini',
        apiKey: 'test-key',
        modelName: 'gemini-1.5-flash'
      })
    ).rejects.toThrow('Gemini API Error (400): Invalid request payload');
  });

  it('should call OpenAI API and return text', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'OpenAI simulated response'
          }
        }
      ]
    };

    const globalFetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })
    );
    vi.stubGlobal('fetch', globalFetchMock);

    const result = await generateLLMReport('hello openai', {
      provider: 'openai',
      apiKey: 'openai-key',
      modelName: 'gpt-4o'
    });

    expect(globalFetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = globalFetchMock.mock.calls[0];

    expect(calledUrl).toContain('api.openai.com/v1/chat/completions');
    expect(calledInit.headers.Authorization).toBe('Bearer openai-key');

    const body = JSON.parse(calledInit.body);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[1].content).toBe('hello openai');
    expect(result).toBe('OpenAI simulated response');
  });

  describe('baseUrl validation (SSRF hardening)', () => {
    const customConfig = (baseUrl: string) => ({
      provider: 'custom',
      apiKey: 'test-key',
      modelName: 'test-model',
      baseUrl,
    });

    it.each([
      'http://169.254.169.254/latest', // cloud metadata endpoint
      'http://localhost:11434',
      'http://127.0.0.1:8080',
      'http://10.0.0.5',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://metadata.google.internal',
      'http://service.cluster.internal',
    ])('rejects private/internal baseUrl %s', async (baseUrl) => {
      await expect(generateLLMReport('prompt', customConfig(baseUrl)))
        .rejects.toThrow(/private or internal hosts/);
    });

    it('rejects non-http schemes', async () => {
      await expect(generateLLMReport('prompt', customConfig('file:///etc/passwd')))
        .rejects.toThrow(/only http\(s\)/);
    });

    it('rejects credentials embedded in the URL', async () => {
      await expect(generateLLMReport('prompt', customConfig('https://user:pass@example.com')))
        .rejects.toThrow(/credentials/);
    });

    it('rejects malformed URLs', async () => {
      await expect(generateLLMReport('prompt', customConfig('not a url')))
        .rejects.toThrow(/not a valid URL/);
    });

    it('rejects model names with path traversal characters', async () => {
      await expect(generateLLMReport('prompt', {
        provider: 'gemini',
        apiKey: 'test-key',
        modelName: '../../evil',
      })).rejects.toThrow(/Invalid LLM model name/);
    });

    it('truncates upstream error bodies instead of echoing them fully', async () => {
      const hugeBody = 'x'.repeat(5000);
      const globalFetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          text: () => Promise.resolve(hugeBody)
        })
      );
      vi.stubGlobal('fetch', globalFetchMock);

      await expect(
        generateLLMReport('prompt', { provider: 'openai', apiKey: 'k', modelName: 'gpt-4o' })
      ).rejects.toSatisfy((err: Error) => err.message.length < 400);
    });
  });
});

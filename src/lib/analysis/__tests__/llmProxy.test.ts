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
    expect(calledUrl).toContain('key=test-key');

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
});

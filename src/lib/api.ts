interface GenerationResult {
  plan: string;
  draft: string;
  final: string;
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  isGenerating: boolean;
  planApproved?: boolean;
}

interface ChatCompletionRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  signal?: AbortSignal;
}

const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";
const DATAFORSEO_API_KEY_STORAGE_KEY = "dataforseo-api-key";

export const loadApiKey = () => {
    return localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || "";
};

export const saveApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
    }
};

export const loadDataForSEOApiKey = () => {
    return localStorage.getItem(DATAFORSEO_API_KEY_STORAGE_KEY) || "";
};

export const saveDataForSEOApiKey = (key: string) => {
    if (key) {
        localStorage.setItem(DATAFORSEO_API_KEY_STORAGE_KEY, key);
    } else {
        localStorage.removeItem(DATAFORSEO_API_KEY_STORAGE_KEY);
    }
};

export const streamGeneration = async ({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  temperature,
  maxTokens,
  topP,
  onContentChunk,
  signal,
}: ChatCompletionRequest & { onContentChunk: (chunk: string) => void }): Promise<{ content: string; isGenerating: boolean }> => {
  // Temporary variable to collect the full response content
  let fullContent = "";

  // Guard against absurd or API-incompatible max_tokens values
  const safeMaxTokens = Math.max(1, Math.min(maxTokens, 16000));

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
      "X-Title": "Agent Blueprint Builder",
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: temperature,
      max_tokens: safeMaxTokens,
      top_p: topP,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    // Attempt to read the error body if it's not a generic network error
    try {
      let errorText = '';
      let errorJson: any = null;
      
      // Try to parse as JSON first (OpenRouter returns JSON errors)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          errorJson = await response.json();
          errorText = JSON.stringify(errorJson, null, 2);
        } catch {
          errorText = await response.text();
        }
      } else {
        errorText = await response.text();
      }
      
      // Extract meaningful error message
      let errorMessage = `API Error: ${response.statusText} (${response.status})`;
      if (errorJson) {
        if (errorJson.error?.message) {
          errorMessage += `\n\n${errorJson.error.message}`;
        }
        if (errorJson.error?.code) {
          errorMessage += `\nError Code: ${errorJson.error.code}`;
        }
        if (errorJson.error?.type) {
          errorMessage += `\nError Type: ${errorJson.error.type}`;
        }
      } else if (errorText) {
        errorMessage += `\n\n${errorText}`;
      }
      
      throw new Error(errorMessage);
    } catch (err) {
      if (err instanceof Error && err.message.includes('API Error')) {
        throw err;
      }
      throw new Error(`API Error: ${response.statusText} (${response.status})`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader for streaming.");
  }

  const decoder = new TextDecoder("utf-8");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);

    // OpenRouter streams data as server-sent events (SSE)
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        if (data === "[DONE]") {
          continue;
        }

        try {
          const json = JSON.parse(data);
          const contentChunk = json.choices[0]?.delta?.content;

          if (contentChunk) {
            fullContent += contentChunk;
            onContentChunk(contentChunk);
          }
        } catch (e) {
          console.error("Error parsing streaming chunk:", e);
          // Do nothing, just continue to the next line
        }
      }
    }
  }

  // Basic cleanup for any stray comments or newlines
  // const cleanedContent = fullContent.replace(/\/\/ Secondary layer of security/g, "").trim();

  return {
    content: fullContent.trim(),
    isGenerating: false,
  };
};

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatRequest {
  apiKey: string;
  model: string;
  messages: Message[];
  temperature: number;
  maxTokens: number;
  topP: number;
  signal?: AbortSignal;
}

export const streamChatCompletion = async ({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  topP,
  onContentChunk,
  onFinishReason,
  signal,
}: StreamChatRequest & { 
  onContentChunk: (chunk: string) => void;
  onFinishReason?: (reason: string) => void;
}): Promise<{ content: string; isGenerating: boolean; finishReason?: string }> => {
  let fullContent = "";
  let lastFinishReason: string | null = null;

  // Same clamping here so chat uses compatible limits as well
  const safeMaxTokens = Math.max(1, Math.min(maxTokens, 16000));

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://agent-blueprint-builder.com",
      "X-Title": "Agent Blueprint Builder",
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: safeMaxTokens,
      top_p: topP,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    try {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.statusText} (${response.status}). Body: ${errorText}`);
    } catch {
      throw new Error(`API Error: ${response.statusText} (${response.status})`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader for streaming.");
  }

  const decoder = new TextDecoder("utf-8");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);

    // OpenRouter streams data as server-sent events (SSE)
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        if (data === "[DONE]") {
          continue;
        }

        try {
          const json = JSON.parse(data);
          const contentChunk = json.choices[0]?.delta?.content;
          const finishReason = json.choices[0]?.finish_reason;

          if (contentChunk) {
            fullContent += contentChunk;
            onContentChunk(contentChunk);
          }

          if (finishReason) {
            lastFinishReason = finishReason;
            if (onFinishReason) {
              onFinishReason(finishReason);
            }
          }
        } catch (e) {
          console.error("Error parsing streaming chunk:", e);
        }
      }
    }
  }

  return {
    content: fullContent.trim(),
    isGenerating: false,
    finishReason: lastFinishReason || undefined,
  };
};

export type { GenerationResult, ChatCompletionRequest };

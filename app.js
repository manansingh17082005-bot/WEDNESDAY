
async function askWednesday(message, onText, signal) {
  if (typeof window.WEDNESDAY_SET_STATE === "function") {
    window.WEDNESDAY_SET_STATE("thinking");
  }

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: WEDNESDAY_SYSTEM_PROMPT },
        ...conversationHistory
      ],
      stream: true,
      options: {
        temperature: 0.6
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Ollama returned no streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Request stopped", "AbortError");
      }

      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const data = JSON.parse(line);

        if (data.error) {
          throw new Error(data.error);
        }

        const token = data.message?.content || "";

        if (token) {
          fullAnswer += token;
          onText(fullAnswer);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const data = JSON.parse(buffer);

      if (data.error) {
        throw new Error(data.error);
      }

      const token = data.message?.content || "";

      if (token) {
        fullAnswer += token;
        onText(fullAnswer);
      }
    }

    if (!fullAnswer.trim()) {
      throw new Error("WEDNESDAY received an empty response.");
    }

    return fullAnswer;
  } finally {
    reader.releaseLock();
  }
}

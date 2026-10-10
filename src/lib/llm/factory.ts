import { GoogleGenerativeAI } from "@google/generative-ai";

export type LLMProvider = "gemini" | "groq" | "ollama" | "llamacpp" | "mock";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseURL?: string;
  modelName?: string;
}

export function getEffectiveLLMConfig(override?: Partial<LLMConfig>): LLMConfig {
  const provider = (override?.provider || process.env.NEXT_PUBLIC_LLM_PROVIDER || process.env.LLM_PROVIDER || "gemini") as LLMProvider;

  if (provider === "groq") {
    return {
      provider: "groq",
      apiKey: override?.apiKey || process.env.GROQ_API_KEY || "",
      baseURL: override?.baseURL || process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1",
      modelName: override?.modelName || process.env.GROQ_MODEL || "llama-3.2-11b-vision-preview",
    };
  }

  if (provider === "ollama") {
    return {
      provider: "ollama",
      apiKey: override?.apiKey || "ollama",
      baseURL: override?.baseURL || process.env.OLLAMA_API_BASE || "http://localhost:11434/v1",
      modelName: override?.modelName || process.env.OLLAMA_MODEL || "gemma2",
    };
  }

  if (provider === "llamacpp") {
    return {
      provider: "llamacpp",
      apiKey: override?.apiKey || "local",
      baseURL: override?.baseURL || process.env.LLAMACPP_API_BASE || "http://localhost:8080/v1",
      modelName: override?.modelName || process.env.LLAMACPP_MODEL || "default",
    };
  }

  if (provider === "gemini") {
    return {
      provider: "gemini",
      apiKey: override?.apiKey || process.env.GEMINI_API_KEY || "",
      baseURL: override?.baseURL || process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com",
      modelName: override?.modelName || process.env.GEMINI_MODEL || "gemini-2.0-flash",
    };
  }

  return {
    provider: "mock",
    apiKey: "mock-key",
    modelName: "mock-model",
  };
}

export interface VisionPromptInput {
  systemPrompt: string;
  userPrompt: string;
  files: Array<{
    mimeType: string;
    base64Data: string;
  }>;
  jsonSchema?: object;
}

export async function callVisionLLM(
  input: VisionPromptInput,
  configOverride?: Partial<LLMConfig>
): Promise<string> {
  const config = getEffectiveLLMConfig(configOverride);

  // If Gemini and API key is present
  if (config.provider === "gemini" && config.apiKey && !config.apiKey.includes("your_api_key")) {
    try {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const model = genAI.getGenerativeModel({
        model: config.modelName || "gemini-2.0-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const parts: any[] = [
        { text: `${input.systemPrompt}\n\nUser instructions: ${input.userPrompt}` },
      ];

      for (const file of input.files) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.base64Data,
          },
        });
      }

      const result = await model.generateContent(parts);
      const response = await result.response;
      return response.text();
    } catch (err: any) {
      console.warn("Gemini Vision API error, attempting fallback:", err.message);
      if (!config.apiKey || config.apiKey.includes("your_api_key")) {
        return mockExtractor(input);
      }
      throw err;
    }
  }

  // If OpenAI-compatible (Groq, Ollama, llamacpp)
  if (
    (config.provider === "groq" || config.provider === "ollama" || config.provider === "llamacpp") &&
    (config.apiKey || config.provider === "ollama" || config.provider === "llamacpp")
  ) {
    try {
      const messages: any[] = [
        { role: "system", content: input.systemPrompt },
      ];

      const userContent: any[] = [{ type: "text", text: input.userPrompt }];

      for (const file of input.files) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${file.mimeType};base64,${file.base64Data}`,
          },
        });
      }

      messages.push({ role: "user", content: userContent });

      const res = await fetch(`${config.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey || "none"}`,
        },
        body: JSON.stringify({
          model: config.modelName,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM provider error (${config.provider} - ${res.status}): ${errorText}`);
      }

      const data = await res.json();
      return data.choices[0]?.message?.content || "{}";
    } catch (err: any) {
      console.warn(`${config.provider} call error:`, err.message);
      if (!config.apiKey || config.provider === "ollama" || config.provider === "llamacpp") {
        return mockExtractor(input);
      }
      throw err;
    }
  }

  // Fallback to intelligent deterministic mock extractor if keys aren't configured yet
  return mockExtractor(input);
}

// Deterministic mock extractor for testing / sandbox before user adds API keys
function mockExtractor(input: VisionPromptInput): string {
  const userText = input.userPrompt.toLowerCase();
  const today = new Date().toISOString().split("T")[0];

  // Check if round-trip scenario
  if (userText.includes("return") || userText.includes("round trip") || userText.includes("back to office")) {
    return JSON.stringify({
      expenses: [
        {
          bill_type: "CAB_LOCAL",
          bill_date: today,
          vendor_name: "Uber India",
          total_amount: 450,
          currency: "INR",
          payment_mode: "UPI",
          remarks: "Return cab trip from client site",
          specific_details: {
            from_place: "Whitefield Tech Park",
            to_place: "Koramangala Office",
            line_items: [{ description: "Uber Go Return Ride", amount: 450 }],
          },
        },
      ],
      raw_reasoning: "Mock: Extracted return ride with inverted destination coordinates.",
      page_count: 1,
    });
  }

  // Check if multi-page scenario requested
  if (userText.includes("multi-page") || userText.includes("multiple") || input.files.length > 1) {
    return JSON.stringify({
      expenses: [
        {
          bill_type: "FLIGHT",
          bill_date: today,
          vendor_name: "IndiGo Airlines",
          total_amount: 5400,
          currency: "INR",
          payment_mode: "Corporate Card",
          remarks: "Bangalore to Mumbai flight",
          specific_details: {
            flight_pnr: "6E-5842",
            from_place: "BLR",
            to_place: "BOM",
            line_items: [
              { description: "Base Fare", amount: 4800 },
              { description: "Airport Taxes & Fees", amount: 600 },
            ],
          },
        },
        {
          bill_type: "FOOD",
          bill_date: today,
          vendor_name: "Airport Bistro",
          total_amount: 650,
          currency: "INR",
          payment_mode: "UPI",
          remarks: "Terminal 2 lunch during transit",
          specific_details: {
            restaurant_name: "Airport Bistro",
            line_items: [
              { description: "Club Sandwich Combo", amount: 450 },
              { description: "Masala Chai", amount: 200 },
            ],
          },
        },
      ],
      raw_reasoning: "Mock: Multi-page document detected. Extracted 2 distinct expenses (Flight & Food).",
      page_count: 2,
    });
  }

  // Check if blurry / missing metadata scenario
  if (userText.includes("blurry") || userText.includes("unreadable") || userText.includes("missing")) {
    return JSON.stringify({
      expenses: [
        {
          bill_type: "FOOD",
          bill_date: null,
          vendor_name: "Local Cafe (Illegible)",
          total_amount: null,
          currency: "INR",
          payment_mode: "Cash",
          remarks: "Receipt is partially truncated at the footer and timestamp is obscured",
          specific_details: {
            line_items: [],
          },
        },
      ],
      raw_reasoning: "Mock: Crucial metadata missing (bill_date & total_amount are null).",
      page_count: 1,
    });
  }

  // Default clean Cab expense
  return JSON.stringify({
    expenses: [
      {
        bill_type: "CAB_LOCAL",
        bill_date: today,
        vendor_name: "Uber India",
        total_amount: 450,
        currency: "INR",
        payment_mode: "UPI",
        remarks: "Client visit outbound",
        specific_details: {
          from_place: "Koramangala Office",
          to_place: "Whitefield Tech Park",
          line_items: [{ description: "Uber Go Trip", amount: 450 }],
        },
      },
    ],
    raw_reasoning: "Mock: Extracted standard cab receipt with valid line items.",
    page_count: 1,
  });
}

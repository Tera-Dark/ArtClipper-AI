import { GoogleGenAI } from "@google/genai";
import { BoundingBox, AISettings } from "../types";
import { GEMINI_MODEL_VISION } from "../constants";

// Helper to compress image and convert to base64
// Keep original MIME type for better proxy compatibility
const compressAndConvertToBase64 = async (file: File, maxSize: number = 1024, quality: number = 0.75): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      // Create canvas and draw compressed image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Keep original MIME type for better compatibility with proxies
      const mimeType = file.type || 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(',')[1];

      console.log(`[Image Compression] ${file.name}: ${img.naturalWidth}x${img.naturalHeight} → ${width}x${height}, type=${mimeType}, ~${Math.round(base64.length / 1024)}KB`);

      resolve({ base64, mimeType });
    };

    img.onerror = reject;
    img.src = url;
  });
};

// Legacy helper (kept for backward compatibility, but not recommended)
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to get image dimensions
const getImageDimensions = (file: File): Promise<{ width: number, height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ========================================================================
// DUAL-MODE API: OpenAI-Compatible (for proxies) vs Google Native
// ========================================================================

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text', text: string } | { type: 'image_url', image_url: { url: string } }>;
}

// OpenAI-Compatible Request (for proxies like Liaobots, ZenMux, etc.)
async function makeOpenAIRequest(
  settings: AISettings,
  messages: OpenAIChatMessage[],
  timeoutMs: number = 60000
): Promise<any> {
  const modelName = settings.model || GEMINI_MODEL_VISION;
  const apiKey = settings.apiKey;
  if (!apiKey) throw new Error("API Key 未配置");

  const baseUrl = (settings.baseUrl || "").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;

  console.log("[GeminiService] OpenAI-Compatible Request to:", url);

  const payload = {
    model: modelName,
    messages: messages,
    max_tokens: 8192  // Gemini uses reasoning tokens internally, need higher limit
  };

  const bodyStr = JSON.stringify(payload);
  console.log(`[API Debug] Request body size: ${Math.round(bodyStr.length / 1024)}KB`);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}秒)，请稍后重试。`)), timeoutMs)
  );

  const fetchPromise = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: bodyStr
  });

  const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

  if (!response.ok) {
    const errText = await response.text();
    console.error("API Error Response:", errText);
    if (response.status === 401) {
      throw new Error(`认证失败 (401): 请检查 API Key 是否正确。`);
    }
    if (response.status === 404) {
      throw new Error(`地址无效 (404): 请求地址 ${url} 不存在。请确认 Base URL 是否正确 (通常以 /v1 结尾)。`);
    }
    throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errText}`);
  }

  return await response.json();
}

// Google Native Request (for direct Google API)
async function makeGoogleNativeRequest(
  settings: AISettings,
  payload: any,
  timeoutMs: number = 60000
): Promise<any> {
  const modelName = settings.model || GEMINI_MODEL_VISION;
  const apiKey = settings.apiKey;
  if (!apiKey) throw new Error("API Key 未配置");

  const encodedModel = encodeURIComponent(modelName);
  const baseUrl = "https://generativelanguage.googleapis.com";
  const url = `${baseUrl}/v1beta/models/${encodedModel}:generateContent?key=${apiKey}`;

  console.log("[GeminiService] Google Native Request to:", url);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}秒)，请稍后重试。`)), timeoutMs)
  );

  const fetchPromise = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

  if (!response.ok) {
    const errText = await response.text();
    console.error("API Error Response:", errText);
    if (response.status === 401) {
      throw new Error(`认证失败 (401): 请检查 API Key 是否正确。`);
    }
    throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errText}`);
  }

  return await response.json();
}

// ========================================================================
// PUBLIC API
// ========================================================================

export const verifyConnection = async (settings: AISettings): Promise<boolean> => {
  try {
    if (settings.useCustomUrl && settings.baseUrl) {
      // OpenAI-Compatible Mode
      const messages: OpenAIChatMessage[] = [{ role: 'user', content: 'Hello' }];
      await makeOpenAIRequest(settings, messages, 30000);
    } else {
      // Google Native Mode
      const payload = { contents: [{ parts: [{ text: "Hello" }] }] };
      await makeGoogleNativeRequest(settings, payload, 15000);
    }
    return true;
  } catch (error) {
    console.error("Connection Verification Failed:", error);
    throw error;
  }
}

export const detectSegments = async (file: File, settings: AISettings): Promise<BoundingBox[]> => {
  try {
    const { width: imgW, height: imgH } = await getImageDimensions(file);
    const MIN_SIZE_PX = 64;

    // Use aggressively compressed image for faster API calls
    // Smaller = faster upload, faster processing, less likely to timeout
    const { base64: base64Data, mimeType } = await compressAndConvertToBase64(file, 768, 0.65);

    const prompt = settings.systemPrompt || `Identify ALL bounding boxes for distinct elements in this image.

Rules:
- Comics/Manga: Separate each panel (look for gutters)
- Sprites: Box each sprite individually  
- Tight fit: Exclude whitespace
- Output: {"boxes":[[ymin,xmin,ymax,xmax],...]} (normalized 0-1)

Return ONLY valid JSON, no markdown.`;

    console.log("Calling AI API...");

    let text: string | undefined;

    if (settings.useCustomUrl && settings.baseUrl) {
      // OpenAI-Compatible Mode (Vision with base64 image)
      // Note: Text BEFORE image for better proxy compatibility
      const messages: OpenAIChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }
      ];
      const data = await makeOpenAIRequest(settings, messages, 90000);
      console.log("OpenAI-Compatible Raw Response:", JSON.stringify(data, null, 2));

      // Debug: Check response structure
      if (data.choices && data.choices[0]) {
        console.log("[API Debug] Choice 0:", JSON.stringify(data.choices[0], null, 2));
        text = data.choices[0].message?.content;

        // Some proxies return content in different formats
        if (!text && data.choices[0].text) {
          text = data.choices[0].text;
        }
      }

      // If still empty, check for error in response
      if (!text && data.error) {
        throw new Error(`API 错误: ${data.error.message || JSON.stringify(data.error)}`);
      }
    } else {
      // Google Native Mode
      const payload = {
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: prompt }
            ]
          }
        ],
        generationConfig: { responseMimeType: "application/json" }
      };
      const data = await makeGoogleNativeRequest(settings, payload, 90000);
      console.log("Google Native Raw Response:", data);
      text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    console.log("AI Response Text:", text);

    if (!text) {
      throw new Error("AI 返回了空内容，请检查 API Key 或模型是否支持 Vision");
    }

    let result: { boxes?: any[] } = { boxes: [] };

    // Strategy 1: Direct JSON parse
    try {
      result = JSON.parse(text);
    } catch (e) {
      // Strategy 2: Extract from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[1].trim()); } catch (err) {/*ignore*/ }
      }

      // Strategy 3: Extract raw JSON object
      if (!result.boxes) {
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          try { result = JSON.parse(objectMatch[0]); } catch (err) {/*ignore*/ }
        }
      }

      // Strategy 4: Handle truncated JSON - extract all valid box arrays
      if (!result.boxes) {
        const boxArrays: number[][] = [];
        // Match complete arrays like [0.1, 0.2, 0.3, 0.4]
        const arrayMatches = text.matchAll(/\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g);
        for (const match of arrayMatches) {
          const nums = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4])];
          if (nums.every(n => !isNaN(n) && n >= 0 && n <= 1)) {
            boxArrays.push(nums);
          }
        }
        if (boxArrays.length > 0) {
          console.log(`[JSON Recovery] Extracted ${boxArrays.length} boxes from truncated response`);
          result = { boxes: boxArrays };
        }
      }

      if (!result.boxes || result.boxes.length === 0) {
        throw new Error(`无法从 AI 返回中解析出 JSON 数据。请重试。`);
      }
    }

    if (!result.boxes || !Array.isArray(result.boxes)) {
      console.warn("Invalid JSON structure:", result);
      return [];
    }

    // Detect coordinate format:
    // 1. Normalized (0-1): all values between 0 and 1
    // 2. Google 0-1000 scale: values roughly 0-1000
    // 3. Absolute pixels: values match compressed image dimensions

    let maxVal = 0;
    result.boxes.forEach((box: any) => {
      if (Array.isArray(box)) {
        box.forEach((v: number) => { if (v > maxVal) maxVal = v; });
      }
    });

    // Determine the scale factor
    let scaleFactor = 1;
    let coordFormat = 'normalized';

    if (maxVal > 1 && maxVal <= 1.5) {
      // Likely normalized but with some rounding error
      scaleFactor = 1;
      coordFormat = 'normalized';
    } else if (maxVal > 1 && maxVal <= 1000) {
      // Google Gemini 0-1000 format
      scaleFactor = 1000;
      coordFormat = '0-1000';
    } else if (maxVal > 1000) {
      // Absolute pixel coordinates (larger images)
      // Use compressed image max dimension
      const maxCompressedSize = 768;
      let compressedW = imgW, compressedH = imgH;
      if (imgW > maxCompressedSize || imgH > maxCompressedSize) {
        if (imgW > imgH) {
          compressedH = Math.round((imgH * maxCompressedSize) / imgW);
          compressedW = maxCompressedSize;
        } else {
          compressedW = Math.round((imgW * maxCompressedSize) / imgH);
          compressedH = maxCompressedSize;
        }
      }
      scaleFactor = Math.max(compressedW, compressedH);
      coordFormat = 'absolute-pixels';
    }

    console.log(`[Box Parse] format: ${coordFormat}, maxVal: ${maxVal}, scaleFactor: ${scaleFactor}, originalSize: ${imgW}x${imgH}`);

    return result.boxes
      .map((box: any, index: number) => {
        let x, y, w, h;

        if (Array.isArray(box)) {
          if (box.length >= 4) {
            let v0 = box[0], v1 = box[1], v2 = box[2], v3 = box[3];

            // Normalize all values to 0-1 range
            if (scaleFactor > 1) {
              v0 = v0 / scaleFactor;
              v1 = v1 / scaleFactor;
              v2 = v2 / scaleFactor;
              v3 = v3 / scaleFactor;
            }

            // Auto-detect format: [ymin, xmin, ymax, xmax] vs [x1, y1, x2, y2]
            // Google Gemini typically uses [ymin, xmin, ymax, xmax]
            // Other APIs might use [x1, y1, x2, y2]
            // Heuristic: Check which interpretation makes geometric sense

            // Assume [ymin, xmin, ymax, xmax] first (Google format)
            let ymin = v0, xmin = v1, ymax = v2, xmax = v3;

            // Validate: if ymin > ymax or xmin > xmax, swap interpretation
            if (ymin > ymax || xmin > xmax) {
              // Try [x1, y1, x2, y2] format
              xmin = Math.min(v0, v2);
              ymin = Math.min(v1, v3);
              xmax = Math.max(v0, v2);
              ymax = Math.max(v1, v3);
            }

            x = xmin;
            y = ymin;
            w = xmax - xmin;
            h = ymax - ymin;
          } else {
            return null;
          }
        } else if (typeof box === 'object') {
          // Object format {xmin, ymin, xmax, ymax}
          let { ymin, xmin, ymax, xmax } = box;
          if (scaleFactor > 1) {
            xmin /= scaleFactor; xmax /= scaleFactor;
            ymin /= scaleFactor; ymax /= scaleFactor;
          }
          x = xmin; y = ymin;
          w = xmax - xmin; h = ymax - ymin;
        } else {
          return null;
        }

        if (x === undefined || y === undefined) return null;

        // Clamp to 0-1 range
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        w = Math.max(0, Math.min(1 - x, w));
        h = Math.max(0, Math.min(1 - y, h));

        return {
          id: `ai-slice-${Date.now()}-${index}`,
          x, y, width: w, height: h,
        };
      })
      .filter((box: any) => {
        if (!box) return false;
        const pxWidth = box.width * imgW;
        const pxHeight = box.height * imgH;
        return !isNaN(pxWidth) && !isNaN(pxHeight) && pxWidth > MIN_SIZE_PX && pxHeight > MIN_SIZE_PX;
      }) as BoundingBox[];

  } catch (error) {
    console.error("AI Vision Analysis Failed:", error);
    throw error;
  }
};
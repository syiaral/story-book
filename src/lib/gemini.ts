import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface StoryPage {
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioData?: string;
}

export interface Story {
  title: string;
  visualStyle: string;
  pages: StoryPage[];
}

export async function generateStory(topic: string, ageGroup: string): Promise<Story> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a short children's story about "${topic}" for children aged ${ageGroup}. 
    The story should have exactly 5 pages. 
    First, define a consistent "visualStyle" for the entire story (e.g., "Whimsical watercolor with soft pastel colors and hand-drawn charcoal outlines").
    Then, for each page, provide the story text and a specific "imagePrompt" that describes the scene. 
    The "imagePrompt" should focus on the action and characters. 
    The "imagePrompt" will be combined with the "visualStyle" later, so focus on the content of the scene.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          visualStyle: { type: Type.STRING, description: "A detailed description of the artistic style for all illustrations." },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING, description: "Description of the scene content only." },
              },
              required: ["text", "imagePrompt"],
            },
          },
        },
        required: ["title", "visualStyle", "pages"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function generateIllustration(prompt: string, visualStyle: string, seed: number, size: "1K" | "2K" | "4K" = "1K"): Promise<string> {
  const fullPrompt = `Artistic Style: ${visualStyle}. Scene Description: ${prompt}`;
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: {
      parts: [{ text: fullPrompt }],
    },
    config: {
      seed: seed,
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: size,
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image");
}

export async function generateSpeech(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this story page cheerfully: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  return base64Audio;
}

export async function chatWithStoryBuddy(message: string, history: { role: "user" | "model"; parts: { text: string }[] }[]) {
  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: {
      systemInstruction: "You are 'Sparky', a friendly and magical story buddy for kids. You love talking about stories, magic, and adventures. Keep your answers short, simple, and very encouraging. Use lots of emojis! ✨🦄",
    },
    history: history,
  });

  const response = await chat.sendMessage({ message: message });
  return response.text;
}

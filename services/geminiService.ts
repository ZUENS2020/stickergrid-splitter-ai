import { GoogleGenAI, Type } from "@google/genai";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API_KEY is missing from environment variables.");
        // We throw here so the UI can catch and show a friendly error
        throw new Error("API Key is missing. Please configure process.env.API_KEY.");
    }
    return new GoogleGenAI({ apiKey });
};

export const generateStickerLabels = async (imageFile: File): Promise<string[]> => {
    try {
        const ai = getClient();
        
        // Convert file to base64 for API
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });

        const prompt = `
            Analyze this image, which is a 4x4 grid of stickers (16 total).
            Provide a short, descriptive filename for each sticker in the grid.
            Read the grid from left to right, top to bottom.
            
            The format should be kebab-case (e.g., "anime-girl-happy", "chibi-wink-peace").
            Focus on the emotion, action, or key object. Keep it under 4 words.
            Do not include file extensions.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: imageFile.type,
                            data: base64Data
                        }
                    },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    description: "A list of 16 filenames corresponding to the stickers",
                    items: {
                        type: Type.STRING
                    }
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("No data returned from AI");

        const labels = JSON.parse(jsonText);
        
        if (!Array.isArray(labels) || labels.length === 0) {
           // Fallback if AI fails to give exactly an array
           return Array(16).fill("sticker");
        }
        
        return labels;

    } catch (error) {
        console.error("Gemini API Error:", error);
        // Fallback labels on error
        return Array(16).fill("processed-sticker");
    }
};


// Fix: Import GoogleGenAI from @google/genai
import { GoogleGenAI } from "@google/genai";
import { Medication, Appointment } from "../types";

// Fix: Initialize the GoogleGenAI client with the API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getHealthInsights = async (meds: Medication[], appointments: Appointment[]) => {
  try {
    const prompt = `Analise os seguintes dados de saúde e dê dicas curtas (máximo 3) em português:
    Medicamentos: ${meds.map(m => `${m.name} (${m.currentStock}/${m.totalStock})`).join(', ')}
    Consultas: ${appointments.map(a => `${a.doctor} - ${a.specialty} em ${a.date}`).join(', ')}
    Foque em estoque baixo e preparação para consultas.`;

    // Updated generateContent call to use model and prompt in a single call as per guidelines
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    // Access the text property directly instead of calling it as a function
    return response.text || "Sem insights no momento.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro ao carregar insights inteligentes.";
  }
};
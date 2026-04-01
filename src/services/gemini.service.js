const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Summarize class transcript using Gemini
 * @param {string} transcript 
 * @returns {Promise<{keyTakeaways: string[], chapterSummaries: string[], actionItems: string[]}>}
 */
async function summarizeTranscript(transcript) {
  try {
    const prompt = `
      You are an expert educational assistant. Summarize this class transcript into:
      - 5 Key Takeaways (bullet points)
      - 3 Chapter Summaries with timestamps if available
      - 3 Action Items or Questions for students to reflect on.
      Keep it concise and student-friendly.
      
      Respond only in JSON format with fields: 
      "keyTakeaways" (array of strings), 
      "chapterSummaries" (array of strings), 
      "actionItems" (array of strings).
      
      Transcript:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response (Gemini sometimes wraps it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse Gemini response');
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error('Gemini summarization error:', error);
    throw error;
  }
}

/**
 * Answer a student's question based on class context (Feature 1)
 * @param {string} context - Transcript or recent chat history
 * @param {string} question - Question from student
 */
async function answerQuestion(context, question) {
  try {
    const prompt = `
      You are a tutor in a live educational class. 
      Answer the student's question based on the provided class context (transcript/chat).
      Be concise, helpful, and maintain a tutor-like tone.
      If the answer is not in the context, use your general knowledge but indicate it wasn't mentioned in the class.
      
      CONTEXT:
      ${context.substring(0, 15000)} // Truncate to stay within prompt limits
      
      QUESTION:
      ${question}
      
      RESPONSE (plain text):
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    logger.error('Gemini Q&A answer error:', error);
    throw error;
  }
}

module.exports = { summarizeTranscript, answerQuestion };

import { LLMProvider, LLMRequest, LLMResponse } from './types';

/**
 * Deterministic offline provider for local demos and end-to-end tests (LLM_PROVIDER=mock).
 * Returns schema-valid JSON so the full generate → edit → approve flow works without an API key.
 * Never use it for real students.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const prompt = req.messages.map((m) => m.content).join('\n');
    const hindi = /Hindi \(Devanagari/.test(prompt);
    const text = /Individualised Education Programme|Draft an IEP/.test(req.system + prompt) ? this.iep(hindi) : this.worksheet(hindi);
    await new Promise((r) => setTimeout(r, 400)); // feel like a real call
    return { text: JSON.stringify(text), model: 'mock-1', usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 600 } };
  }

  private iep(hi: boolean) {
    if (hi) {
      return {
        presentLevels: 'विद्यार्थी कहानियाँ सुनना पसंद करता है और अधिकांश अक्षर-ध्वनियाँ पहचानता है। शब्दों को जोड़कर पढ़ना अभी विकसित हो रहा है।',
        goals: [
          { domain: 'READING', goalText: 'सत्र के अंत तक विद्यार्थी 20 सरल शब्द 80% सटीकता से पढ़ेगा।', baseline: '20 में से 4 शब्द', target: '20 में से 16 शब्द', measurement: 'साप्ताहिक शब्द जाँच', accommodations: ['बड़े अक्षर', 'अतिरिक्त समय'], interventions: ['बहु-संवेदी ध्वनि अभ्यास', 'साथी पाठक'] },
          { domain: 'WRITING', goalText: 'सत्र के अंत तक विद्यार्थी शब्द-सूची की मदद से 4 शब्दों का वाक्य लिखेगा।', baseline: '2 शब्द', target: '4 शब्दों का वाक्य', measurement: 'पाक्षिक लेखन नमूना', accommodations: ['चौड़ी लाइन वाली कॉपी'], interventions: ['वाक्य ढाँचे'] },
          { domain: 'COMMUNICATION', goalText: 'समीक्षा तिथि तक विद्यार्थी चित्र-कार्ड से कहानी की 4 घटनाएँ क्रम से बताएगा।', baseline: '2 घटनाएँ', target: '4 घटनाएँ', measurement: 'मासिक जाँच सूची', accommodations: ['चित्र-कार्ड'], interventions: ['कहानी मानचित्र'] },
        ],
        suggestedReviewWeeks: 12,
      };
    }
    return {
      presentLevels:
        'The student is curious and enjoys hands-on activities and stories. The student knows most letter sounds and is building blending, sentence writing and sustained attention with short, structured tasks.',
      goals: [
        { domain: 'READING', goalText: 'By the end of term, the student will read 20 CVC words aloud with 80% accuracy in 4 of 5 weekly probes.', baseline: '4 of 20 words', target: '16 of 20 words', measurement: 'Weekly 20-word probe', accommodations: ['Large print', 'Extra time'], interventions: ['Multisensory phonics with letter tiles', 'Peer reading buddy'] },
        { domain: 'WRITING', goalText: 'By the end of term, the student will write a 4-word sentence with a capital letter and full stop, using a word bank, in 4 of 5 attempts.', baseline: 'Writes 2-word phrases', target: '4-word sentences', measurement: 'Fortnightly writing sample', accommodations: ['Wide-lined notebook'], interventions: ['Sentence frames'] },
        { domain: 'BEHAVIOUR', goalText: 'By the review date, the student will stay on a seated task for 10 minutes with one reminder in 4 of 5 sessions.', baseline: '5 minutes with 3 reminders', target: '10 minutes with 1 reminder', measurement: 'Daily timer log', accommodations: ['Movement breaks', 'Visual timer'], interventions: ['First–then board', 'Classroom job after tasks'] },
      ],
      suggestedReviewWeeks: 12,
    };
  }

  private worksheet(hi: boolean) {
    if (hi) {
      return {
        title: 'आम गिनो, जोड़ो',
        level: 'कक्षा 2 स्तर',
        sections: [
          { heading: 'शुरुआत', instructions: 'चित्र देखो। आम गिनो। संख्या लिखो।', questions: [{ text: 'कितने आम हैं? [चित्र: 3 आम]', answerType: 'number' }, { text: '2 + 1 = ?', answerType: 'multiple_choice', options: ['2', '3', '4'] }] },
        ],
      };
    }
    return {
      title: 'Count and Add with Mangoes',
      level: 'Class 2 maths',
      sections: [
        {
          heading: 'Warm up',
          instructions: 'Look at the picture. Count the mangoes. Write the number.',
          questions: [
            { text: 'How many mangoes? [picture: 3 mangoes]', answerType: 'number' },
            { text: '2 + 1 = ?', answerType: 'multiple_choice', options: ['2', '3', '4'] },
          ],
        },
        {
          heading: 'Try it',
          instructions: 'Use the number line. Start at the first number. Jump forward.',
          questions: [
            { text: '4 + 3 = ?', answerType: 'number' },
            { text: 'Draw 5 rotis.', answerType: 'draw' },
          ],
        },
      ],
    };
  }
}

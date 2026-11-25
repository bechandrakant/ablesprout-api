/**
 * Seeds one demo school. Re-runnable: it removes only the previous demo school's data
 * (found via the demo admin email) and never touches other schools.
 *   npm run seed            (dev, tsx)
 *   node dist/scripts/seed.js   (inside the Docker image)
 */
import { Types } from 'mongoose';
import { connectDB, disconnectDB } from '../src/db/connect';
import { hashPassword } from '../src/services/auth.service';
import { Assessment, AuditLog, Iep, Message, ProgressEntry, School, Student, User, Worksheet } from '../src/models';

const DEMO_ADMIN = 'admin@sunrise.example';
const PASSWORD = 'Demo@12345';
const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);

async function wipeDemo() {
  const admin = await User.findOne({ email: DEMO_ADMIN });
  if (!admin) return;
  const schoolId = admin.schoolId;
  await Promise.all(
    [Assessment, AuditLog, Iep, Message, ProgressEntry, Student, User, Worksheet].map((m) =>
      (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({ schoolId }),
    ),
  );
  await School.deleteOne({ _id: schoolId });
  console.log('Removed previous demo school');
}

async function main() {
  await connectDB();
  await Promise.all([User, Student, Iep, Assessment, ProgressEntry, Worksheet, Message, AuditLog].map((m) => (m as unknown as { syncIndexes: () => Promise<unknown> }).syncIndexes()));
  await wipeDemo();

  const passwordHash = await hashPassword(PASSWORD);
  const school = await School.create({ name: 'Sunrise Inclusive Public School', city: 'Pune', state: 'Maharashtra', board: 'CBSE' });
  const schoolId = school._id;
  const mk = (name: string, email: string, role: string, extra: object = {}) =>
    User.create({ schoolId, name, email, role, passwordHash, ...extra });

  const admin = await mk('Priya Deshpande', DEMO_ADMIN, 'ADMIN', { phone: '+91 98200 00001' });
  const kavya = await mk('Kavya Iyer', 'kavya@sunrise.example', 'EDUCATOR'); // special educator
  const rohan = await mk('Rohan Mehta', 'rohan@sunrise.example', 'EDUCATOR'); // occupational therapist
  const sunita = await mk('Sunita Sharma', 'sunita@parent.example', 'PARENT', { preferredLanguage: 'hi' });
  const imran = await mk('Imran Khan', 'imran@parent.example', 'PARENT');

  const st = (o: object) => Student.create({ schoolId, ...o });
  const aarav = await st({
    name: 'Aarav Sharma', dateOfBirth: new Date('2017-04-12'), grade: '3', section: 'A',
    disabilityCategories: ['SPECIFIC_LEARNING_DISABILITIES'],
    notes: 'Enjoys cricket and storytelling; strong oral vocabulary. Finds decoding and spelling effortful.',
    educatorIds: [kavya._id], parentIds: [sunita._id],
  });
  const zoya = await st({
    name: 'Zoya Khan', dateOfBirth: new Date('2018-09-03'), grade: '2', section: 'B',
    disabilityCategories: ['AUTISM_SPECTRUM_DISORDER'],
    notes: 'Loves trains and puzzles. Prefers predictable routines; uses short phrases to request.',
    educatorIds: [kavya._id, rohan._id], parentIds: [imran._id],
  });
  const vihaan = await st({
    name: 'Vihaan Reddy', dateOfBirth: new Date('2016-01-20'), grade: '4', section: 'A',
    disabilityCategories: ['ADHD'],
    notes: 'Energetic and curious; excellent at hands-on science. Benefits from movement breaks.',
    educatorIds: [kavya._id],
  });
  const ananya = await st({
    name: 'Ananya Gupta', dateOfBirth: new Date('2015-07-08'), grade: '5', section: 'C',
    disabilityCategories: ['LOW_VISION'],
    notes: 'Reads N18 print comfortably; sits in front row. Strong in mental maths and music.',
    educatorIds: [rohan._id],
  });
  const arjun = await st({
    name: 'Arjun Nair', dateOfBirth: new Date('2018-11-15'), grade: '1', section: 'A',
    disabilityCategories: ['INTELLECTUAL_DISABILITY'],
    notes: 'Cheerful and helpful in class jobs. Working on self-care routines and fine motor skills.',
    educatorIds: [rohan._id],
  });
  const meher = await st({
    name: 'Meher Joshi', dateOfBirth: new Date('2014-03-27'), grade: '6', section: 'B',
    disabilityCategories: ['SPECIFIC_LEARNING_DISABILITIES', 'SPEECH_AND_LANGUAGE_DISABILITY'],
    notes: 'Creative artist; prefers showing understanding through drawing. Number facts are effortful.',
    educatorIds: [kavya._id, rohan._id],
  });

  const as = (studentId: Types.ObjectId, educatorId: Types.ObjectId, type: string, domain: string, scores: Record<string, number>, observations: string, ago: number) =>
    ({ schoolId, studentId, educatorId, type, domain, scores, observations, date: daysAgo(ago) });
  await Assessment.insertMany([
    as(aarav._id, kavya._id, 'SCREENING', 'READING', { letterSounds: 3, blending: 2, sightWords: 2, comprehensionOral: 4 }, 'Knows most letter sounds; blends CVC words slowly; retells stories well.', 75),
    as(aarav._id, kavya._id, 'SKILL', 'WRITING', { letterFormation: 3, spelling: 1, sentenceWriting: 2 }, 'Reverses b/d; writes 2-word phrases with prompts.', 70),
    as(zoya._id, kavya._id, 'OBSERVATION', 'COMMUNICATION', { requesting: 3, turnTaking: 2, followingInstructions: 2 }, 'Uses 2-word phrases to request; follows one-step visual instructions.', 40),
    as(zoya._id, rohan._id, 'OBSERVATION', 'SOCIAL', { sharedAttention: 2, peerPlay: 2 }, 'Engages in parallel play with trains; joins circle time for 5 minutes.', 35),
    as(vihaan._id, kavya._id, 'OBSERVATION', 'BEHAVIOUR', { onTask: 2, waitingTurn: 2, transitions: 3 }, 'On task for about 6 minutes; responds well to timers and jobs.', 30),
    as(vihaan._id, kavya._id, 'SKILL', 'MATH', { multiplication: 4, wordProblems: 3 }, 'Strong number sense; skips steps in multi-step problems.', 28),
    as(ananya._id, rohan._id, 'SCREENING', 'READING', { fluencyLargePrint: 4, fluencyStandardPrint: 2 }, 'Fluent with N18 print; fatigue after 10 minutes of standard print.', 50),
    as(arjun._id, rohan._id, 'SKILL', 'DAILY_LIVING', { handWashing: 3, buttoning: 1, tiffinOpening: 2 }, 'Washes hands with picture sequence; needs hand-over-hand for buttons.', 45),
    as(arjun._id, rohan._id, 'SKILL', 'MOTOR', { pincerGrip: 2, cutting: 1 }, 'Uses palmar grip on crayons; enjoys play-dough activities.', 44),
    as(meher._id, kavya._id, 'SKILL', 'MATH', { numberFacts: 2, placeValue: 3, moneySkills: 3 }, 'Uses fingers for facts within 20; good with rupee notes in role-play.', 20),
  ]);

  // Approved IEP for Aarav with ~8 weeks of progress.
  const start = daysAgo(60);
  const aaravIep = await Iep.create({
    schoolId, studentId: aarav._id, createdById: kavya._id, status: 'APPROVED', language: 'en', aiGenerated: true,
    approvedAt: daysAgo(58), approvedById: kavya._id, startDate: start, reviewDate: new Date(Date.now() + 20 * day),
    presentLevels:
      'Aarav is an enthusiastic storyteller with strong oral vocabulary and listening comprehension. He knows most letter sounds and is beginning to blend CVC words with support. Spelling and independent sentence writing are emerging; he benefits from multisensory practice and extra time.',
    goals: [
      {
        domain: 'READING', status: 'IN_PROGRESS',
        goalText: 'By the end of term, Aarav will read 20 CVC words aloud with 80% accuracy in 4 of 5 weekly probes, using finger-tapping to blend.',
        baseline: 'Blends 4 of 20 CVC words (20%)', target: '16 of 20 CVC words (80%)', measurement: 'Weekly 20-word probe, recorded by the special educator',
        accommodations: ['Extra time for reading tasks', 'Large, clear print with wide spacing', 'Oral answers accepted for comprehension'],
        interventions: ['Daily 10-minute multisensory phonics (sand tray, letter tiles)', 'Peer reading buddy for 3 sessions a week'],
      },
      {
        domain: 'WRITING', status: 'IN_PROGRESS',
        goalText: 'By the end of term, Aarav will write a 4-word sentence with a capital letter and full stop, using a word bank, in 4 of 5 attempts.',
        baseline: 'Writes 2-word phrases with prompting', target: '4-word sentences independently with word bank', measurement: 'Fortnightly writing sample scored on a 4-point checklist',
        accommodations: ['Wide-lined notebook', 'b/d visual reminder strip on desk'],
        interventions: ['Sentence frames ("I see a ___.")', 'Air-writing and tracing before writing'],
      },
      {
        domain: 'COMMUNICATION', status: 'NOT_STARTED',
        goalText: 'By the review date, Aarav will retell a class story in 4 correct sequence steps using picture cards in 4 of 5 opportunities.',
        baseline: 'Retells 2 events in order', target: '4 events in order', measurement: 'Monthly story retell checklist',
        accommodations: ['Picture sequence cards'], interventions: ['Story maps', 'Think-pair-share with a partner'],
      },
    ],
  });
  const [readGoal, writeGoal] = aaravIep.goals;
  const progress = [
    [readGoal, [20, 25, 35, 40, 50, 55, 65, 70]],
    [writeGoal, [25, 30, 30, 45, 50, 60]],
  ] as const;
  await ProgressEntry.insertMany(
    progress.flatMap(([goal, values]) =>
      values.map((value, i) => ({
        schoolId, studentId: aarav._id, iepId: aaravIep._id, goalId: goal._id, educatorId: kavya._id,
        value, date: daysAgo(56 - i * 7), note: i === values.length - 1 ? 'Steady improvement; more confident.' : undefined,
      })),
    ),
  );

  // A draft (AI-generated, awaiting review) for Zoya.
  await Iep.create({
    schoolId, studentId: zoya._id, createdById: kavya._id, status: 'DRAFT', aiGenerated: true, startDate: new Date(), reviewDate: new Date(Date.now() + 84 * day),
    presentLevels: 'Zoya communicates needs with 2-word phrases and follows one-step visual instructions. She shows strong interest in trains and puzzles, which can be used to build engagement.',
    goals: [
      { domain: 'COMMUNICATION', goalText: 'By the review date, Zoya will use a 3-word phrase to request a preferred item in 4 of 5 opportunities.', baseline: '2-word requests', target: '3-word requests', measurement: 'Daily tally during snack and play', accommodations: ['Visual choice board'], interventions: ['Modelling and expansion', 'Train-themed requesting games'] },
      { domain: 'SOCIAL', goalText: 'By the review date, Zoya will take 3 turns in a structured game with one peer in 4 of 5 sessions.', baseline: '1 turn with adult prompt', target: '3 turns with a peer', measurement: 'Weekly observation checklist', accommodations: ['"My turn / your turn" card'], interventions: ['Peer-mediated play'] },
      { domain: 'BEHAVIOUR', goalText: 'By the review date, Zoya will move between activities using a visual schedule with no more than one prompt in 4 of 5 transitions.', baseline: 'Needs 3+ prompts', target: '1 prompt', measurement: 'Transition log', accommodations: ['Visual schedule', '2-minute warning timer'], interventions: ['First-then board'] },
    ],
  });

  const ws = (o: object) => Worksheet.create({ schoolId, createdById: kavya._id, aiGenerated: true, ...o });
  const w1 = await ws({
    studentId: aarav._id, goalId: readGoal._id, title: 'Tap and Read: CVC Words', subject: 'English', level: 'Class 1 reading level',
    language: 'en', adaptations: ['dyslexia_font', 'large_print', 'chunked_steps', 'visual_supports'],
    content: { sections: [
      { heading: 'Warm up', instructions: 'Look at the picture. Say the sounds. Tap a finger for each sound. Read the word.',
        questions: [
          { text: 'c - a - t [picture: a cat]', answerType: 'short_text' },
          { text: 'b - a - t [picture: a cricket bat]', answerType: 'short_text' },
          { text: 'p - e - n [picture: a pen]', answerType: 'short_text' },
        ] },
      { heading: 'Pick the word', instructions: 'Read the sentence. Circle the right word.',
        questions: [
          { text: 'The ___ is on the mat.', answerType: 'multiple_choice', options: ['cat', 'cup', 'sun'] },
          { text: 'I hit the ball with a ___.', answerType: 'multiple_choice', options: ['bat', 'hat', 'pot'] },
        ] },
    ] },
  });
  await ws({
    studentId: aarav._id, goalId: writeGoal._id, title: 'मेरा वाक्य (My Sentence)', subject: 'Hindi', level: 'कक्षा 1 स्तर',
    language: 'hi', adaptations: ['large_print', 'chunked_steps'],
    content: { sections: [
      { heading: 'शब्द चुनो', instructions: 'चित्र देखो। सही शब्द चुनो। वाक्य लिखो।',
        questions: [
          { text: 'मैं ___ खाता हूँ।', answerType: 'multiple_choice', options: ['आम', 'बस', 'घर'] },
          { text: 'यह मेरी ___ है।', answerType: 'multiple_choice', options: ['किताब', 'पानी', 'दौड़'] },
          { text: 'अपना एक वाक्य लिखो।', answerType: 'long_text' },
        ] },
    ] },
  });
  await Worksheet.create({
    schoolId, createdById: rohan._id, studentId: ananya._id, aiGenerated: true, title: 'Fractions with Rotis', subject: 'Maths', level: 'Class 5 maths',
    language: 'en', adaptations: ['large_print', 'high_contrast', 'extra_spacing'],
    sourceText: 'Q1. What fraction of the roti is shaded? Q2. Add 1/4 + 2/4. Q3. Which is bigger, 1/2 or 1/3?',
    content: { sections: [
      { heading: 'Fractions', instructions: 'Read each question. Write your answer in the box.',
        questions: [
          { text: 'A roti is cut into 4 equal parts. 1 part is eaten. What fraction is eaten?', answerType: 'short_text' },
          { text: '1/4 + 2/4 = ?', answerType: 'number' },
          { text: 'Which is bigger: 1/2 or 1/3?', answerType: 'multiple_choice', options: ['1/2', '1/3'] },
        ] },
    ] },
  });

  const msg = (senderId: Types.ObjectId, body: string, ago: number, extra: object = {}) => ({
    schoolId, studentId: aarav._id, senderId, body, createdAt: daysAgo(ago), updatedAt: daysAgo(ago),
    readBy: [{ userId: senderId, readAt: daysAgo(ago) }], ...extra,
  });
  await Message.insertMany([
    msg(kavya._id, 'Namaste Sunita ji! Aarav read 14 of 20 words in this week’s probe – his best so far. I’m attaching a practice sheet for home.', 6, { attachmentWorksheetId: w1._id }),
    msg(sunita._id, 'Thank you ma’am! He was very happy. We will practise 10 minutes every evening.', 5),
    msg(kavya._id, 'Wonderful. Please let him tap a finger for each sound – that is the strategy we use in class.', 5),
    msg(sunita._id, 'Ji, sure. Should we also practise writing?', 1),
  ]);

  await AuditLog.create({ schoolId, userId: admin._id, action: 'CREATE', entity: 'School', entityId: schoolId, meta: { seed: true } });

  console.log(`Seeded "${school.name}" with 6 students, ${await Assessment.countDocuments({ schoolId })} assessments, 2 IEPs, 3 worksheets, 4 messages.`);
  console.log('Demo logins are listed in README.md.');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});

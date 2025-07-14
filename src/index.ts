import { Bot } from 'workergram';
import { Env } from './types';

// Difficulty levels for AI-generated questions
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];

// Default question bank for fallback
const fallbackQuestions = [
  {
    question: "If the day after tomorrow is Wednesday, what day is it today?",
    options: ["Monday", "Tuesday", "Sunday", "Friday"],
    answer: "Monday",
    explanation: "If the day after tomorrow is Wednesday, tomorrow is Tuesday, so today is Monday.",
    difficulty: "easy"
  },
  {
    question: "What number comes next in the sequence: 2, 4, 8, 16?",
    options: ["24", "32", "28", "30"],
    answer: "32",
    explanation: "Each number doubles: 2 × 2 = 4, 4 × 2 = 8, 8 × 2 = 16, 16 × 2 = 32.",
    difficulty: "medium"
  },
  {
    question: "Which shape completes the pattern: Circle, Square, Triangle, Circle, Square?",
    options: ["Square", "Circle", "Triangle", "Hexagon"],
    answer: "Triangle",
    explanation: "The pattern repeats every three shapes: Circle, Square, Triangle.",
    difficulty: "hard"
  }
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    // Generate a new question using Workers AI
    async function generateQuestion(difficulty: string) {
      try {
        const prompt = `Generate an IQ test question suitable for a ${difficulty} difficulty level. The question should be a multiple-choice question with 4 options, one correct answer, and a concise explanation (max 50 words). Return the response in JSON format with fields: question, options (array), answer, explanation, and difficulty.`;
        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', { prompt });
        return JSON.parse(aiResponse.response);
      } catch (error) {
        console.error('AI question generation failed:', error);
        // Fallback to a random question from the default bank
        return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
      }
    }

    // Update leaderboard in KV
    async function updateLeaderboard(userId: string, username: string, score: number) {
      const leaderboard = (await env.KV_IQMASTER.get('leaderboard', 'json')) || [];
      const existing = leaderboard.find((entry: any) => entry.userId === userId);
      if (existing) {
        existing.score = Math.max(existing.score, score);
      } else {
        leaderboard.push({ userId, username, score });
      }
      leaderboard.sort((a: any, b: any) => b.score - a.score);
      await env.KV_IQMASTER.put('leaderboard', JSON.stringify(leaderboard.slice(0, 10))); // Top 10
    }

    // Handle /start command
    bot.onCommand('start', async (ctx) => {
      const userId = ctx.message.from.id.toString();
      const username = ctx.message.from.username || ctx.message.from.first_name;
      const userData = {
        score: 0,
        currentQuestion: 0,
        answered: [],
        difficulty: 'easy',
        streak: 0,
        username
      };
      await env.KV_IQMASTER.put(`user:${userId}`, JSON.stringify(userData));
      await ctx.reply(
        `Welcome to IQ Master Bot, ${username}! Test your intelligence with dynamic quizzes.\n` +
        `Commands:\n/quiz - Start a quiz\n/score - View score\n/leaderboard - Top players\n/difficulty - Set difficulty\n/reset - Reset progress`
      );
    });

    // Handle /quiz command
    bot.onCommand('quiz', async (ctx) => {
      const userId = ctx.message.from.id.toString();
      const userData = await env.KV_IQMASTER.get(`user:${userId}`, 'json');
      
      if (!userData) {
        await ctx.reply('Please start the bot with /start first!');
        return;
      }

      if (userData.currentQuestion >= 10) { // Limit to 10 questions per session
        await ctx.reply('You’ve completed this session! Score: ' + userData.score + '. Type /reset to start a new session.');
        return;
      }

      const question = await generateQuestion(userData.difficulty);
      await env.KV_IQMASTER.put(`question:${userId}:${userData.currentQuestion}`, JSON.stringify(question));

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...question.options.map((option: string, index: number) => [
              { text: option, callback_data: `answer:${index}:${userData.currentQuestion}` }
            ]),
            [{ text: 'Skip', callback_data: `skip:${userData.currentQuestion}` }]
          ]
        }
      };
      await ctx.reply(`[${question.difficulty.toUpperCase()}] ${question.question}`, keyboard);
    });

    // Handle /score command
    bot.onCommand('score', async (ctx) => {
      const userId = ctx.message.from.id.toString();
      const userData = await env.KV_IQMASTER.get(`user:${userId}`, 'json');
      
      if (!userData) {
        await ctx.reply('Please start the bot with /start first!');
        return;
      }
      
      await ctx.reply(
        `📊 Your Stats\n` +
        `Score: ${userData.score}\n` +
        `Questions Answered: ${userData.answered.length}\n` +
        `Current Streak: ${userData.streak}\n` +
        `Difficulty: ${userData.difficulty}`
      );
    });

    // Handle /leaderboard command
    bot.onCommand('leaderboard', async (ctx) => {
      const leaderboard = (await env.KV_IQMASTER.get('leaderboard', 'json')) || [];
      if (leaderboard.length === 0) {
        await ctx.reply('No scores yet! Be the first to climb the leaderboard with /quiz.');
        return;
      }
      const message = '🏆 Leaderboard\n' + leaderboard.map((entry: any, i: number) => 
        `${i + 1}. ${entry.username}: ${entry.score}`
      ).join('\n');
      await ctx.reply(message);
    });

    // Handle /difficulty command
    bot.onCommand('difficulty', async (ctx) => {
      const userId = ctx.message.from.id.toString();
      const userData = await env.KV_IQMASTER.get(`user:${userId}`, 'json');
      
      if (!userData) {
        await ctx.reply('Please start the bot with /start first!');
        return;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: DIFFICULTY_LEVELS.map(level => [
            { text: level.charAt(0).toUpperCase() + level.slice(1), callback_data: `difficulty:${level}` }
          ])
        }
      };
      await ctx.reply('Choose your difficulty level:', keyboard);
    });

    // Handle /reset command
    bot.onCommand('reset', async (ctx) => {
      const userId = ctx.message.from.id.toString();
      const username = ctx.message.from.username || ctx.message.from.first_name;
      const userData = {
        score: 0,
        currentQuestion: 0,
        answered: [],
        difficulty: 'easy',
        streak: 0,
        username
      };
      await env.KV_IQMASTER.put(`user:${userId}`, JSON.stringify(userData));
      await ctx.reply('Progress reset! Type /quiz to start a new session.');
    });

    // Handle callback queries (answers, skips, difficulty changes)
    bot.onUpdate('callback_query', async (ctx) => {
      const userId = ctx.callbackQuery.from.id.toString();
      const userData = await env.KV_IQMASTER.get(`user:${userId}`, 'json');
      
      if (!userData) {
        await ctx.reply('Please start the bot with /start first!');
        return;
      }

      const [action, value, questionIndex] = ctx.callbackQuery.data.split(':');
      const currentQuestion = parseInt(questionIndex) || userData.currentQuestion;

      if (action === 'difficulty') {
        userData.difficulty = value;
        await env.KV_IQMASTER.put(`user:${userId}`, JSON.stringify(userData));
        await ctx.reply(`Difficulty set to ${value}. Start with /quiz.`);
        await ctx.answer('Difficulty updated!');
        return;
      }

      const question = await env.KV_IQMASTER.get(`question:${userId}:${currentQuestion}`, 'json');
      if (!question) {
        await ctx.reply('Question not found. Please start a new quiz with /quiz.');
        return;
      }

      if (action === 'skip') {
        userData.currentQuestion += 1;
        userData.streak = 0;
        await env.KV_IQMASTER.put(`user:${userId}`, JSON.stringify(userData));
        await ctx.reply('Question skipped. Type /quiz for the next question.');
        await ctx.answer('Skipped!');
        return;
      }

      const isCorrect = question.options[parseInt(value)] === question.answer;
      const points = isCorrect ? { easy: 5, medium: 10, hard: 15 }[question.difficulty] || 10 : 0;
      userData.score += points;
      userData.streak = isCorrect ? userData.streak + 1 : 0;
      userData.answered.push({ question: currentQuestion, correct: isCorrect });
      userData.currentQuestion += 1;

      // Update leaderboard
      await updateLeaderboard(userId, userData.username, userData.score);
      await env.KV_IQMASTER.put(`user:${userId}`, JSON.stringify(userData));

      // Generate AI explanation
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt: `Explain why "${question.options[parseInt(value)]}" is ${isCorrect ? 'correct' : 'incorrect'} for the question "${question.question}". Provide a concise explanation (max 50 words) similar to: "${question.explanation}"`
      });

      await ctx.reply(
        `Your answer: ${question.options[parseInt(value)]}\n` +
        `${isCorrect ? `Correct! +${points} points` : 'Incorrect!'}\n` +
        `Explanation: ${aiResponse.response}\n` +
        `Streak: ${userData.streak}\n` +
        `Type /quiz for the next question or /score to see your stats.`
      );
      await ctx.answer('Answer received!');
    });

    // Process incoming Telegram updates
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await bot.processUpdate(update);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error processing update:', error);
        return new Response('Error processing update', { status: 500 });
      }
    }

    return new Response('IQ Master Bot is running!', { status: 200 });
  }
};

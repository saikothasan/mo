// IQ Master Telegram Bot - Cloudflare Worker
// Deploy with: wrangler deploy

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  AI: any; // Cloudflare AI binding
  KV: KVNamespace; // For storing user data
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

interface UserData {
  userId: number;
  username: string;
  firstName: string;
  totalQuestions: number;
  correctAnswers: number;
  currentStreak: number;
  bestStreak: number;
  iqScore: number;
  lastActive: number;
  difficulty: 'easy' | 'medium' | 'hard';
  categories: string[];
}

interface IQQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  category: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Webhook endpoint for Telegram
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const update: TelegramUpdate = await request.json();
      await handleUpdate(update, env);
      return new Response('OK');
    }
    
    // Set webhook endpoint
    if (url.pathname === '/set-webhook' && request.method === 'GET') {
      const webhookUrl = `${url.origin}/webhook`;
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      const result = await response.json();
      return new Response(JSON.stringify(result), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    return new Response('IQ Master Bot is running!', { status: 200 });
  }
};

async function handleUpdate(update: TelegramUpdate, env: Env) {
  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  }
}

async function handleMessage(message: any, env: Env) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';
  const firstName = message.from.first_name;
  const username = message.from.username || '';

  // Initialize or get user data
  let userData = await getUserData(userId, env);
  if (!userData) {
    userData = {
      userId,
      username,
      firstName,
      totalQuestions: 0,
      correctAnswers: 0,
      currentStreak: 0,
      bestStreak: 0,
      iqScore: 100,
      lastActive: Date.now(),
      difficulty: 'medium',
      categories: ['logic', 'math', 'pattern', 'verbal']
    };
    await saveUserData(userData, env);
  }

  // Update last active
  userData.lastActive = Date.now();
  await saveUserData(userData, env);

  // Handle commands
  if (text.startsWith('/start')) {
    await sendWelcomeMessage(chatId, firstName, env);
  } else if (text.startsWith('/help')) {
    await sendHelpMessage(chatId, env);
  } else if (text.startsWith('/stats')) {
    await sendStatsMessage(chatId, userData, env);
  } else if (text.startsWith('/question')) {
    await sendIQQuestion(chatId, userData, env);
  } else if (text.startsWith('/difficulty')) {
    await sendDifficultyMenu(chatId, env);
  } else if (text.startsWith('/leaderboard')) {
    await sendLeaderboard(chatId, env);
  } else if (text.startsWith('/reset')) {
    await resetUserProgress(chatId, userId, env);
  } else {
    await sendIQQuestion(chatId, userData, env);
  }
}

async function handleCallbackQuery(callbackQuery: any, env: Env) {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;

  let userData = await getUserData(userId, env);
  if (!userData) return;

  if (data.startsWith('answer_')) {
    const selectedAnswer = parseInt(data.split('_')[1]);
    const questionData = JSON.parse(data.split('_')[2] || '{}');
    await processAnswer(chatId, messageId, userId, selectedAnswer, questionData, env);
  } else if (data.startsWith('difficulty_')) {
    const difficulty = data.split('_')[1] as 'easy' | 'medium' | 'hard';
    userData.difficulty = difficulty;
    await saveUserData(userData, env);
    await editMessage(chatId, messageId, `✅ Difficulty set to *${difficulty.toUpperCase()}*`, env);
  } else if (data === 'next_question') {
    await sendIQQuestion(chatId, userData, env);
  }

  // Answer callback query
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQuery.id })
  });
}

async function sendWelcomeMessage(chatId: number, firstName: string, env: Env) {
  const message = `🧠 *Welcome to IQ Master Bot, ${firstName}!*

I'm your personal IQ trainer! I'll help you:
• 🎯 Test your intelligence with challenging questions
• 📊 Track your progress and IQ score
• 🏆 Compete with others on the leaderboard
• 🎓 Learn with detailed explanations

*Commands:*
/question - Get a new IQ question
/stats - View your statistics
/difficulty - Change difficulty level
/leaderboard - View top performers
/help - Show all commands

Ready to challenge your mind? Let's start! 🚀`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎯 Start First Question', callback_data: 'next_question' }],
      [{ text: '⚙️ Set Difficulty', callback_data: 'difficulty_menu' }]
    ]
  };

  await sendMessage(chatId, message, keyboard, env);
}

async function sendHelpMessage(chatId: number, env: Env) {
  const message = `🔧 *IQ Master Bot Commands*

*Main Commands:*
/question - Get a new IQ question
/stats - View your detailed statistics
/difficulty - Change difficulty (Easy/Medium/Hard)
/leaderboard - View top 10 performers
/reset - Reset your progress

*How it works:*
• Each question is generated using AI
• Your IQ score is calculated based on performance
• Difficulty affects point values and question complexity
• Streaks boost your score multiplier

*Scoring System:*
• Easy: 1 point per correct answer
• Medium: 2 points per correct answer  
• Hard: 3 points per correct answer
• Streak bonus: +10% per consecutive correct answer

*Categories:*
• 🧮 Mathematical reasoning
• 🧩 Pattern recognition
• 🔤 Verbal intelligence
• 🎯 Logical thinking

Need help? Just send any message to get a new question! 🎓`;

  await sendMessage(chatId, message, null, env);
}

async function sendStatsMessage(chatId: number, userData: UserData, env: Env) {
  const accuracy = userData.totalQuestions > 0 ? 
    ((userData.correctAnswers / userData.totalQuestions) * 100).toFixed(1) : '0.0';
  
  const level = getLevel(userData.iqScore);
  const progressBar = getProgressBar(userData.iqScore);

  const message = `📊 *Your IQ Master Statistics*

👤 *Player:* ${userData.firstName}
🧠 *Current IQ Score:* ${userData.iqScore}
📈 *Level:* ${level}
${progressBar}

📋 *Performance:*
• Total Questions: ${userData.totalQuestions}
• Correct Answers: ${userData.correctAnswers}
• Accuracy: ${accuracy}%
• Current Streak: ${userData.currentStreak}
• Best Streak: ${userData.bestStreak}

⚙️ *Settings:*
• Difficulty: ${userData.difficulty.toUpperCase()}
• Last Active: ${new Date(userData.lastActive).toLocaleDateString()}

Keep practicing to improve your IQ score! 🎯`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎯 New Question', callback_data: 'next_question' }],
      [{ text: '⚙️ Change Difficulty', callback_data: 'difficulty_menu' }]
    ]
  };

  await sendMessage(chatId, message, keyboard, env);
}

async function sendIQQuestion(chatId: number, userData: UserData, env: Env) {
  try {
    const question = await generateIQQuestion(userData.difficulty, env);
    
    const message = `🧠 *IQ Challenge - ${question.difficulty.toUpperCase()}*
📂 *Category:* ${question.category}

${question.question}

Choose your answer:`;

    const keyboard = {
      inline_keyboard: question.options.map((option, index) => [{
        text: `${String.fromCharCode(65 + index)}. ${option}`,
        callback_data: `answer_${index}_${Buffer.from(JSON.stringify({
          correct: question.correctAnswer,
          explanation: question.explanation,
          difficulty: question.difficulty
        })).toString('base64')}`
      }])
    };

    await sendMessage(chatId, message, keyboard, env);
  } catch (error) {
    await sendMessage(chatId, '❌ Sorry, there was an error generating the question. Please try again.', null, env);
  }
}

async function generateIQQuestion(difficulty: string, env: Env): Promise<IQQuestion> {
  const categories = ['mathematical reasoning', 'pattern recognition', 'verbal intelligence', 'logical thinking'];
  const category = categories[Math.floor(Math.random() * categories.length)];
  
  const prompt = `Generate a challenging IQ question for ${difficulty} difficulty level in the category of ${category}.

Requirements:
- Create an original, thought-provoking question
- Provide exactly 4 multiple choice options (A, B, C, D)
- Include a clear explanation of the correct answer
- Make it appropriate for ${difficulty} level
- Focus on ${category}

Format your response as JSON:
{
  "question": "The actual question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "explanation": "Detailed explanation of why this is correct",
  "difficulty": "${difficulty}",
  "category": "${category}"
}`;

  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const result = JSON.parse(response.response);
    return {
      question: result.question,
      options: result.options,
      correctAnswer: result.correctAnswer,
      explanation: result.explanation,
      difficulty: difficulty,
      category: category
    };
  } catch (error) {
    // Fallback question if AI fails
    return {
      question: "If 2 + 2 = 4, and 3 + 3 = 6, what is 4 + 4?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      explanation: "Following the pattern, 4 + 4 = 8",
      difficulty: difficulty,
      category: "mathematical reasoning"
    };
  }
}

async function processAnswer(chatId: number, messageId: number, userId: number, selectedAnswer: number, questionData: any, env: Env) {
  let userData = await getUserData(userId, env);
  if (!userData) return;

  const isCorrect = selectedAnswer === questionData.correct;
  const points = getPoints(questionData.difficulty, isCorrect, userData.currentStreak);
  
  userData.totalQuestions++;
  
  if (isCorrect) {
    userData.correctAnswers++;
    userData.currentStreak++;
    userData.bestStreak = Math.max(userData.bestStreak, userData.currentStreak);
    userData.iqScore += points;
  } else {
    userData.currentStreak = 0;
    userData.iqScore = Math.max(50, userData.iqScore - 1); // Minimum IQ of 50
  }

  await saveUserData(userData, env);

  const resultIcon = isCorrect ? '✅' : '❌';
  const resultText = isCorrect ? 'Correct!' : 'Incorrect!';
  const streakText = userData.currentStreak > 1 ? `\n🔥 Streak: ${userData.currentStreak}` : '';
  
  const message = `${resultIcon} *${resultText}*
${questionData.explanation}

📊 *Score Update:*
• Points: ${isCorrect ? `+${points}` : '-1'}
• New IQ Score: ${userData.iqScore}${streakText}

Want to continue? 🎯`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎯 Next Question', callback_data: 'next_question' }],
      [{ text: '📊 View Stats', callback_data: 'stats' }]
    ]
  };

  await editMessage(chatId, messageId, message, env, keyboard);
}

async function sendDifficultyMenu(chatId: number, env: Env) {
  const message = `⚙️ *Choose Difficulty Level*

🟢 *Easy:* Basic questions, +1 point per correct answer
🟡 *Medium:* Standard questions, +2 points per correct answer
🔴 *Hard:* Challenging questions, +3 points per correct answer

Select your preferred difficulty:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🟢 Easy', callback_data: 'difficulty_easy' }],
      [{ text: '🟡 Medium', callback_data: 'difficulty_medium' }],
      [{ text: '🔴 Hard', callback_data: 'difficulty_hard' }]
    ]
  };

  await sendMessage(chatId, message, keyboard, env);
}

async function sendLeaderboard(chatId: number, env: Env) {
  // This would require implementing a global leaderboard system
  // For now, showing a placeholder
  const message = `🏆 *Global Leaderboard*

🥇 Einstein_2024 - IQ: 180
🥈 BrainMaster - IQ: 165
🥉 LogicKing - IQ: 158
4️⃣ MathGenius - IQ: 152
5️⃣ PatternPro - IQ: 148
6️⃣ QuizMaster - IQ: 145
7️⃣ ThinkFast - IQ: 142
8️⃣ SmartCookie - IQ: 140
9️⃣ BrainBoost - IQ: 138
🔟 MindReader - IQ: 135

Keep practicing to climb the ranks! 🧠`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎯 Practice Now', callback_data: 'next_question' }]
    ]
  };

  await sendMessage(chatId, message, keyboard, env);
}

async function resetUserProgress(chatId: number, userId: number, env: Env) {
  const userData = await getUserData(userId, env);
  if (!userData) return;

  userData.totalQuestions = 0;
  userData.correctAnswers = 0;
  userData.currentStreak = 0;
  userData.bestStreak = 0;
  userData.iqScore = 100;
  
  await saveUserData(userData, env);
  
  const message = `🔄 *Progress Reset Complete*

Your statistics have been reset:
• IQ Score: 100
• All counters reset to 0

Ready for a fresh start? 🎯`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎯 Start New Challenge', callback_data: 'next_question' }]
    ]
  };

  await sendMessage(chatId, message, keyboard, env);
}

// Helper functions
function getPoints(difficulty: string, isCorrect: boolean, streak: number): number {
  if (!isCorrect) return 0;
  
  const basePoints = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const streakBonus = Math.floor(streak / 5) * 0.1; // 10% bonus per 5 streak
  return Math.floor(basePoints * (1 + streakBonus));
}

function getLevel(iqScore: number): string {
  if (iqScore >= 200) return '🎓 Genius';
  if (iqScore >= 180) return '🧠 Brilliant';
  if (iqScore >= 160) return '⭐ Gifted';
  if (iqScore >= 140) return '💡 Superior';
  if (iqScore >= 120) return '📚 Above Average';
  if (iqScore >= 100) return '🎯 Average';
  if (iqScore >= 80) return '📖 Below Average';
  return '🔰 Beginner';
}

function getProgressBar(iqScore: number): string {
  const maxScore = 200;
  const progress = Math.min(iqScore / maxScore, 1);
  const filledBars = Math.floor(progress * 10);
  const emptyBars = 10 - filledBars;
  
  return '🔹'.repeat(filledBars) + '🔸'.repeat(emptyBars) + ` ${Math.floor(progress * 100)}%`;
}

async function getUserData(userId: number, env: Env): Promise<UserData | null> {
  const data = await env.KV.get(`user_${userId}`);
  return data ? JSON.parse(data) : null;
}

async function saveUserData(userData: UserData, env: Env): Promise<void> {
  await env.KV.put(`user_${userData.userId}`, JSON.stringify(userData));
}

async function sendMessage(chatId: number, text: string, keyboard: any, env: Env): Promise<void> {
  const payload: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function editMessage(chatId: number, messageId: number, text: string, env: Env, keyboard?: any): Promise<void> {
  const payload: any = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'Markdown'
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

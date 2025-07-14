interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  IQ_BOT_KV: KVNamespace;
  AI: any;
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

interface UserSession {
  currentQuestionIndex: number;
  score: number;
  questionsAnswered: number;
  totalQuestions: number;
  startTime: number;
  currentQuestion?: IQQuestion;
  testType: string;
}

interface IQQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  explanation: string;
}

interface UserStats {
  totalTests: number;
  averageScore: number;
  bestScore: number;
  totalQuestionsAnswered: number;
  correctAnswers: number;
  lastTestDate: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    
    if (url.pathname === '/set-webhook' && request.method === 'GET') {
      return setWebhook(env);
    }
    
    return new Response('IQ Master Bot is running!', { status: 200 });
  },
};

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const update: TelegramUpdate = await request.json();
    
    if (update.message) {
      await handleMessage(update.message, env);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env);
    }
    
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response('Error', { status: 500 });
  }
}

async function handleMessage(message: any, env: Env): Promise<void> {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';
  
  const commands = {
    '/start': () => sendWelcomeMessage(chatId, env),
    '/help': () => sendHelpMessage(chatId, env),
    '/test': () => showTestTypes(chatId, env),
    '/stats': () => showUserStats(chatId, userId, env),
    '/leaderboard': () => showLeaderboard(chatId, env),
    '/random': () => startRandomTest(chatId, userId, env),
  };
  
  const command = text.split(' ')[0];
  const handler = commands[command as keyof typeof commands];
  
  if (handler) {
    await handler();
  } else {
    await sendMessage(chatId, "I don't understand that command. Use /help to see available commands.", env);
  }
}

async function handleCallbackQuery(callbackQuery: any, env: Env): Promise<void> {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  await answerCallbackQuery(callbackQuery.id, env);
  
  if (data.startsWith('test_')) {
    const testType = data.replace('test_', '');
    await startTest(chatId, userId, testType, env);
  } else if (data.startsWith('answer_')) {
    const answerIndex = parseInt(data.replace('answer_', ''));
    await handleAnswer(chatId, userId, answerIndex, env);
  } else if (data === 'next_question') {
    await nextQuestion(chatId, userId, env);
  } else if (data === 'end_test') {
    await endTest(chatId, userId, env);
  }
}

async function sendWelcomeMessage(chatId: number, env: Env): Promise<void> {
  const message = `🧠 Welcome to IQ Master Bot! 🧠

I'm your professional IQ testing companion. I can help you:

🎯 Take comprehensive IQ tests
📊 Track your progress and statistics
🏆 Compete on the leaderboard
🎲 Get random brain teasers

Ready to challenge your mind? Use /test to start!`;

  await sendMessage(chatId, message, env);
}

async function sendHelpMessage(chatId: number, env: Env): Promise<void> {
  const message = `📚 IQ Master Bot Commands:

/start - Welcome message and introduction
/test - Start a new IQ test
/random - Get a random IQ question
/stats - View your personal statistics
/leaderboard - See top performers
/help - Show this help message

🧠 Test Types Available:
• Quick Test (10 questions)
• Standard Test (25 questions)
• Full Test (50 questions)
• Logic & Reasoning
• Mathematical Intelligence
• Spatial Intelligence
• Verbal Intelligence

Good luck testing your IQ! 🎯`;

  await sendMessage(chatId, message, env);
}

async function showTestTypes(chatId: number, env: Env): Promise<void> {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🚀 Quick Test (10Q)", callback_data: "test_quick" },
        { text: "📊 Standard Test (25Q)", callback_data: "test_standard" }
      ],
      [
        { text: "🎯 Full Test (50Q)", callback_data: "test_full" }
      ],
      [
        { text: "🧮 Math Intelligence", callback_data: "test_math" },
        { text: "🔤 Verbal Intelligence", callback_data: "test_verbal" }
      ],
      [
        { text: "🎲 Logic & Reasoning", callback_data: "test_logic" },
        { text: "🎨 Spatial Intelligence", callback_data: "test_spatial" }
      ]
    ]
  };
  
  await sendMessage(chatId, "Choose your IQ test type:", env, keyboard);
}

async function startTest(chatId: number, userId: number, testType: string, env: Env): Promise<void> {
  const testConfig = {
    quick: { questions: 10, name: "Quick Test" },
    standard: { questions: 25, name: "Standard Test" },
    full: { questions: 50, name: "Full Test" },
    math: { questions: 20, name: "Mathematical Intelligence" },
    verbal: { questions: 20, name: "Verbal Intelligence" },
    logic: { questions: 20, name: "Logic & Reasoning" },
    spatial: { questions: 20, name: "Spatial Intelligence" }
  };
  
  const config = testConfig[testType as keyof typeof testConfig];
  if (!config) return;
  
  const session: UserSession = {
    currentQuestionIndex: 0,
    score: 0,
    questionsAnswered: 0,
    totalQuestions: config.questions,
    startTime: Date.now(),
    testType: testType
  };
  
  await env.IQ_BOT_KV.put(`session_${userId}`, JSON.stringify(session));
  
  await sendMessage(chatId, `🎯 Starting ${config.name}!\n\nYou'll answer ${config.questions} questions. Good luck! 🍀`, env);
  
  setTimeout(() => nextQuestion(chatId, userId, env), 1000);
}

async function startRandomTest(chatId: number, userId: number, env: Env): Promise<void> {
  const question = await generateRandomQuestion(env);
  if (!question) return;
  
  const session: UserSession = {
    currentQuestionIndex: 0,
    score: 0,
    questionsAnswered: 0,
    totalQuestions: 1,
    startTime: Date.now(),
    currentQuestion: question,
    testType: 'random'
  };
  
  await env.IQ_BOT_KV.put(`session_${userId}`, JSON.stringify(session));
  await presentQuestion(chatId, question, env);
}

async function nextQuestion(chatId: number, userId: number, env: Env): Promise<void> {
  const sessionData = await env.IQ_BOT_KV.get(`session_${userId}`);
  if (!sessionData) return;
  
  const session: UserSession = JSON.parse(sessionData);
  
  if (session.currentQuestionIndex >= session.totalQuestions) {
    await endTest(chatId, userId, env);
    return;
  }
  
  const question = await generateQuestion(session.testType, env);
  if (!question) return;
  
  session.currentQuestion = question;
  session.currentQuestionIndex++;
  
  await env.IQ_BOT_KV.put(`session_${userId}`, JSON.stringify(session));
  await presentQuestion(chatId, question, env, session.currentQuestionIndex, session.totalQuestions);
}

async function presentQuestion(chatId: number, question: IQQuestion, env: Env, current?: number, total?: number): Promise<void> {
  const progress = current && total ? `Question ${current}/${total}\n` : '';
  const difficulty = getDifficultyEmoji(question.difficulty);
  
  let message = `${progress}${difficulty} ${question.category}\n\n${question.question}`;
  
  const keyboard = {
    inline_keyboard: question.options.map((option, index) => [
      { text: `${String.fromCharCode(65 + index)}) ${option}`, callback_data: `answer_${index}` }
    ])
  };
  
  await sendMessage(chatId, message, env, keyboard);
}

async function handleAnswer(chatId: number, userId: number, answerIndex: number, env: Env): Promise<void> {
  const sessionData = await env.IQ_BOT_KV.get(`session_${userId}`);
  if (!sessionData) return;
  
  const session: UserSession = JSON.parse(sessionData);
  const question = session.currentQuestion;
  if (!question) return;
  
  const isCorrect = answerIndex === question.correctAnswer;
  if (isCorrect) {
    session.score++;
  }
  
  session.questionsAnswered++;
  
  const resultEmoji = isCorrect ? '✅' : '❌';
  const correctAnswer = String.fromCharCode(65 + question.correctAnswer);
  
  let message = `${resultEmoji} ${isCorrect ? 'Correct!' : 'Wrong!'}\n\n`;
  message += `The correct answer was: ${correctAnswer}) ${question.options[question.correctAnswer]}\n\n`;
  message += `💡 ${question.explanation}`;
  
  await env.IQ_BOT_KV.put(`session_${userId}`, JSON.stringify(session));
  
  const keyboard = session.testType === 'random' 
    ? { inline_keyboard: [[{ text: "🎲 Another Random Question", callback_data: "test_random" }]] }
    : { inline_keyboard: [[{ text: "➡️ Next Question", callback_data: "next_question" }]] };
  
  await sendMessage(chatId, message, env, keyboard);
  
  if (session.testType === 'random') {
    await updateUserStats(userId, session.score, 1, env);
  }
}

async function endTest(chatId: number, userId: number, env: Env): Promise<void> {
  const sessionData = await env.IQ_BOT_KV.get(`session_${userId}`);
  if (!sessionData) return;
  
  const session: UserSession = JSON.parse(sessionData);
  const percentage = Math.round((session.score / session.totalQuestions) * 100);
  const timeTaken = Math.round((Date.now() - session.startTime) / 1000);
  
  const iqScore = calculateIQ(percentage, session.totalQuestions);
  const performance = getPerformanceLevel(percentage);
  
  let message = `🏁 Test Complete!\n\n`;
  message += `📊 Results:\n`;
  message += `• Score: ${session.score}/${session.totalQuestions} (${percentage}%)\n`;
  message += `• Estimated IQ: ${iqScore}\n`;
  message += `• Performance: ${performance}\n`;
  message += `• Time taken: ${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s\n\n`;
  message += `🎯 Keep practicing to improve your score!`;
  
  await updateUserStats(userId, session.score, session.totalQuestions, env);
  await env.IQ_BOT_KV.delete(`session_${userId}`);
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔄 Take Another Test", callback_data: "test_quick" },
        { text: "📊 View Stats", callback_data: "stats" }
      ]
    ]
  };
  
  await sendMessage(chatId, message, env, keyboard);
}

async function generateQuestion(testType: string, env: Env): Promise<IQQuestion | null> {
  const prompts = {
    quick: "Generate a moderate difficulty IQ question with logical reasoning",
    standard: "Generate a balanced IQ question covering various cognitive abilities",
    full: "Generate a comprehensive IQ question with detailed explanation",
    math: "Generate a mathematical intelligence question involving calculations, patterns, or numerical reasoning",
    verbal: "Generate a verbal intelligence question involving vocabulary, analogies, or language comprehension",
    logic: "Generate a logical reasoning question with deductive or inductive reasoning",
    spatial: "Generate a spatial intelligence question involving mental rotation or visual patterns"
  };
  
  const prompt = prompts[testType as keyof typeof prompts] || prompts.quick;
  
  const aiPrompt = `${prompt}. 

Format your response as a JSON object with:
- question: string (the question text)
- options: array of 4 strings (answer choices)
- correctAnswer: number (0-3, index of correct answer)
- difficulty: string ("easy", "medium", or "hard")
- category: string (brief category name)
- explanation: string (brief explanation of the correct answer)

Make it challenging but fair. Ensure only one answer is clearly correct.`;
  
  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: aiPrompt }]
    });
    
    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const question = JSON.parse(jsonMatch[0]);
      return question;
    }
  } catch (error) {
    console.error('Error generating question:', error);
  }
  
  return getFallbackQuestion();
}

async function generateRandomQuestion(env: Env): Promise<IQQuestion | null> {
  const categories = ['math', 'verbal', 'logic', 'spatial'];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  return generateQuestion(randomCategory, env);
}

function getFallbackQuestion(): IQQuestion {
  const fallbackQuestions = [
    {
      question: "If it takes 5 machines 5 minutes to make 5 widgets, how long would it take 100 machines to make 100 widgets?",
      options: ["5 minutes", "20 minutes", "100 minutes", "500 minutes"],
      correctAnswer: 0,
      difficulty: "medium" as const,
      category: "Logic",
      explanation: "Each machine makes 1 widget in 5 minutes, so 100 machines would make 100 widgets in 5 minutes."
    },
    {
      question: "What number should replace the question mark in this sequence: 2, 6, 12, 20, 30, ?",
      options: ["38", "40", "42", "44"],
      correctAnswer: 2,
      difficulty: "medium" as const,
      category: "Pattern Recognition",
      explanation: "The differences between consecutive terms are 4, 6, 8, 10, so the next difference is 12: 30 + 12 = 42."
    }
  ];
  
  return fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
}

function calculateIQ(percentage: number, totalQuestions: number): number {
  const baseIQ = 100;
  const maxDeviation = 50;
  const scalingFactor = totalQuestions > 25 ? 1.2 : totalQuestions > 10 ? 1.1 : 1.0;
  
  const deviation = ((percentage - 50) / 50) * maxDeviation * scalingFactor;
  return Math.max(70, Math.min(180, Math.round(baseIQ + deviation)));
}

function getPerformanceLevel(percentage: number): string {
  if (percentage >= 90) return "🌟 Exceptional";
  if (percentage >= 80) return "🎯 Excellent";
  if (percentage >= 70) return "👍 Good";
  if (percentage >= 60) return "📈 Average";
  if (percentage >= 50) return "💪 Below Average";
  return "📚 Needs Improvement";
}

function getDifficultyEmoji(difficulty: string): string {
  const emojis = {
    easy: "🟢",
    medium: "🟡",
    hard: "🔴"
  };
  return emojis[difficulty as keyof typeof emojis] || "🟡";
}

async function updateUserStats(userId: number, score: number, totalQuestions: number, env: Env): Promise<void> {
  const statsKey = `stats_${userId}`;
  const existingStatsData = await env.IQ_BOT_KV.get(statsKey);
  
  let stats: UserStats;
  if (existingStatsData) {
    stats = JSON.parse(existingStatsData);
  } else {
    stats = {
      totalTests: 0,
      averageScore: 0,
      bestScore: 0,
      totalQuestionsAnswered: 0,
      correctAnswers: 0,
      lastTestDate: new Date().toISOString()
    };
  }
  
  const currentPercentage = Math.round((score / totalQuestions) * 100);
  
  stats.totalTests++;
  stats.totalQuestionsAnswered += totalQuestions;
  stats.correctAnswers += score;
  stats.averageScore = Math.round((stats.correctAnswers / stats.totalQuestionsAnswered) * 100);
  stats.bestScore = Math.max(stats.bestScore, currentPercentage);
  stats.lastTestDate = new Date().toISOString();
  
  await env.IQ_BOT_KV.put(statsKey, JSON.stringify(stats));
}

async function showUserStats(chatId: number, userId: number, env: Env): Promise<void> {
  const statsData = await env.IQ_BOT_KV.get(`stats_${userId}`);
  
  if (!statsData) {
    await sendMessage(chatId, "📊 You haven't taken any tests yet! Use /test to start your first IQ test.", env);
    return;
  }
  
  const stats: UserStats = JSON.parse(statsData);
  const lastTest = new Date(stats.lastTestDate).toLocaleDateString();
  
  let message = `📊 Your IQ Test Statistics\n\n`;
  message += `🎯 Tests Taken: ${stats.totalTests}\n`;
  message += `📈 Average Score: ${stats.averageScore}%\n`;
  message += `🏆 Best Score: ${stats.bestScore}%\n`;
  message += `❓ Questions Answered: ${stats.totalQuestionsAnswered}\n`;
  message += `✅ Correct Answers: ${stats.correctAnswers}\n`;
  message += `📅 Last Test: ${lastTest}\n\n`;
  message += `Keep practicing to improve your cognitive abilities! 🧠`;
  
  await sendMessage(chatId, message, env);
}

async function showLeaderboard(chatId: number, env: Env): Promise<void> {
  // This would require a more complex implementation to aggregate stats across users
  // For now, show a placeholder message
  const message = `🏆 Leaderboard\n\n🚧 Coming Soon! 🚧\n\nThe leaderboard feature will be available in the next update. Keep testing to be ready for the competition!`;
  
  await sendMessage(chatId, message, env);
}

async function sendMessage(chatId: number, text: string, env: Env, replyMarkup?: any): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function answerCallbackQuery(queryId: string, env: Env): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: queryId })
  });
}

async function setWebhook(env: Env): Promise<Response> {
  const webhookUrl = `https://your-worker-domain.workers.dev/webhook`;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET
    })
  });
  
  const result = await response.json();
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
}

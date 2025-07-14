export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      is_bot: boolean
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
    chat: {
      id: number
      first_name?: string
      last_name?: string
      username?: string
      type: string
    }
    date: number
    text?: string
    entities?: any[]
  }
  callback_query?: {
    id: string
    from: {
      id: number
      is_bot: boolean
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
    message?: {
      message_id: number
      from: {
        id: number
        is_bot: boolean
        first_name: string
        username: string
      }
      chat: {
        id: number
        first_name?: string
        last_name?: string
        username?: string
        type: string
      }
      date: number
      text: string
    }
    inline_message_id?: string
    chat_instance: string
    data?: string // The data sent with the callback button
    game_short_name?: string
  }
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
  // Add other fields if needed, e.g., login_url, switch_inline_query, etc.
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

// Database types
export interface User {
  chat_id: string
  score: number
  current_question_id: string | null
  selected_category: string
  created_at: string
  updated_at: string
}

export interface Question {
  id: string
  question_text: string
  correct_answer: string
  explanation: string
  category: string
  created_at: string
}

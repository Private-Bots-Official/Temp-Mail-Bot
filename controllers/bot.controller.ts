import { UserRepository } from "../database/repositories/user.repository.ts";
import { TelegramService } from "../services/telegram.service.ts";
import { SubscriptionService } from "../services/subscription.service.ts";
import { EmailService } from "../services/email.service.ts";
import { ADMIN_ID, USE_DB } from "../config/config.ts";
import type { InlineKeyboardMarkup } from "../types/telegram-types.ts";
import type { TelegramMessage, TelegramCallbackQuery } from "../types/telegram-types.ts";

const KEYBOARDS = {
  start: {
    inline_keyboard: [
      [
        { 
          text: "> Updates Channel <", 
          url: "https://t.me/XylonBots" 
        }
      ],
      [{ 
        text: "Source Code ↗️", 
        url: `https://github.com/Private-Bots-Official/Temp-Mail-Bot`
      }],
    ]
  } satisfies InlineKeyboardMarkup,
  
  main: {
    inline_keyboard: [
      [
        { text: "Generate", callback_data: "generate" },
        { text: "Refresh", callback_data: "refresh" },
        { text: "Close", callback_data: "close" }
      ],
      [{ 
        text: "Source Code ↗️", 
        url: `https://github.com/Private-Bots-Official/Temp-Mail-Bot`
      }],
    ]
  } satisfies InlineKeyboardMarkup,
  
  message: {
    inline_keyboard: [
      [
        { text: "Refresh", callback_data: "refresh" },
        { text: "Close", callback_data: "close" }
      ],
      [{ 
        text: "Source Code ↗️", 
        url: `https://github.com/Private-Bots-Official/Temp-Mail-Bot`
      }],
    ]
  } satisfies InlineKeyboardMarkup,
  
  joinChannel: {
    inline_keyboard: [
      [
        { 
          text: "Join Channel", 
          url: "https://t.me/XylonBots" 
        }
      ],
      [{ 
        text: "Source Code ↗️", 
        url: `https://github.com/Private-Bots-Official/Temp-Mail-Bot`
      }],
    ]
  } satisfies InlineKeyboardMarkup
};

export const BotController = {
  async handleUpdate(update: any): Promise<void> {
    try {
      if (update.message) await this.handleMessage(update.message);
      if (update.callback_query) await this.handleCallback(update.callback_query);
    } catch (error) {
      console.error("Update handling error:", error);
    }
  },

  private async handleMessage(message: TelegramMessage) {
    const { chat, from, text } = message;
    if (!text || !from) return;

    if (text === "/start") {
      await this.handleStartCommand(chat.id, from.id);
    } else if (text === "/users" && chat.id === ADMIN_ID) {
      await this.handleUsersCommand(chat.id);
    }
  },

  private async handleStartCommand(chatId: number, userId: number) {
    try {
      const isSubscribed = await SubscriptionService.checkSubscription(userId);
      
      if (!isSubscribed) {
        return TelegramService.sendMessage(
          chatId,
          "❌ *Please join our channel to use this bot:* [@XylonBots](https://t.me/XylonBots)",
          {
            parse_mode: "Markdown",
            reply_markup: KEYBOARDS.joinChannel,
            disable_web_page_preview: true
          }
        );
      }

      await TelegramService.sendMessage(
        chatId,
        `*Welcome to Temp Mail Bot!* 🚀\n\n` +
        `_Generate disposable emails and receive messages directly here._`,
        {
          parse_mode: "Markdown",
          reply_markup: KEYBOARDS.start
        }
      );

      await TelegramService.sendMessage(
        chatId,
        "*Click below to generate a temporary email:* 🔐",
        {
          parse_mode: "Markdown",
          reply_markup: KEYBOARDS.main
        }
      );
    } catch (error) {
      console.error("Start command error:", error);
      await TelegramService.sendMessage(
        chatId,
        "⚠️ Failed to initialize. Please try again."
      );
    }
  },

  private async handleUsersCommand(chatId: number) {
    try {
      const userCount = await UserRepository.countUsers();
      const responseText = USE_DB
        ? `📊 Database Users: *${userCount}*`
        : `📱 Active Sessions: *${userCount}*`;

      await TelegramService.sendMessage(
        chatId,
        responseText,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Users command error:", error);
      await TelegramService.sendMessage(
        chatId,
        "⚠️ Failed to fetch user data"
      );
    }
  },

  private async handleCallback(callback: TelegramCallbackQuery) {
    if (!callback.message || !callback.data) return;
    
    const { message, from, data } = callback;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    try {
      const user = await UserRepository.findOrCreate(from.id);

      switch(data) {
        case "generate":
          const { email, token } = await EmailService.generateEmail();
          await UserRepository.updateUser(from.id, { email, email_token: token });
          
          await TelegramService.editMessageText(
            chatId,
            messageId,
            `📧 *Your Temporary Email:* \`${email}\``,
            {
              parse_mode: "Markdown",
              reply_markup: KEYBOARDS.main
            }
          );
          break;

        case "refresh":
          if (!user.email_token) {
            await TelegramService.editMessageText(
              chatId,
              messageId,
              "⚠️ Please generate an email first",
              { reply_markup: KEYBOARDS.main }
            );
            return;
          }

          const emails = await EmailService.fetchEmails(user.email_token);
          const latestEmail = emails.find((e: any) => e.mail_subject);
          
          if (latestEmail) {
            const content = await EmailService.fetchEmailContent(
              user.email_token,
              latestEmail.mail_id
            );
            
            await UserRepository.updateUser(from.id, { idnum: latestEmail.mail_id });
            
            await TelegramService.editMessageText(
              chatId,
              messageId,
              `📬 *New Message*\n` +
              `From: ${content.mail_from}\n` +
              `Subject: ${content.mail_subject}\n\n` +
              `${content.mail_body}`,
              {
                parse_mode: "Markdown",
                reply_markup: KEYBOARDS.message
              }
            );
          } else {
            await TelegramService.editMessageText(
              chatId,
              messageId,
              `📭 No new messages for \`${user.email}\``,
              {
                parse_mode: "Markdown",
                reply_markup: KEYBOARDS.main
              }
            );
          }
          break;

        case "close":
          await UserRepository.updateUser(from.id, {
            email: "",
            email_token: "",
            idnum: ""
          });
          
          await TelegramService.editMessageText(
            chatId,
            messageId,
            "🗑️ Session cleared successfully",
            { reply_markup: KEYBOARDS.main }
          );
          break;

        default:
          await TelegramService.sendMessage(
            chatId,
            "⚠️ Unknown action",
            { reply_markup: KEYBOARDS.main }
          );
      }
    } catch (error) {
      console.error("Callback handling error:", error);
      await TelegramService.editMessageText(
        chatId,
        messageId,
        "⚠️ Failed to process request"
      );
    }
  }
};


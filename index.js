const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

// Bot token and API keys
const telegramToken = "7867936970:AAGXmmMqKnyxU0EiburDdMbf6p_jRBDeMyo"; // Replace with your bot token
const removeBgApiKey = "zZFYAM1LsodBAK7CQo9xshCa"; // Replace with your remove.bg API key
const adminId = "1343548529"; // Replace with your admin's Telegram chat ID
const requiredChannel = "@awt_bots"; // Replace with your channel username
const databaseChannel = "@awtbotsdb"; // Replace with your database channel username

// Create a new Telegram bot instance
const bot = new TelegramBot(telegramToken, { polling: true });

// User database
const userData = {};
let isBotStarted = false;

// Function to check if a user is a member of the required channel
const isMemberOfChannel = async (userId) => {
  try {
    const response = await bot.getChatMember(requiredChannel, userId);
    return (
      response.status === "member" ||
      response.status === "administrator" ||
      response.status === "creator"
    );
  } catch (error) {
    console.error("Error checking channel membership:", error.message);
    return false;
  }
};

// Function to send processed image to database channel
const sendToDatabase = async (outputPath, username) => {
  try {
    await bot.sendPhoto(databaseChannel, outputPath, {
      caption: `Processed image from @${username}`,
    });
  } catch (error) {
    console.error("Error sending to database channel:", error.message);
  }
};

// Function to send user start information to the database channel
const notifyDatabaseOnStart = async (username) => {
  try {
    await bot.sendMessage(
      databaseChannel,
      `New user started the bot:\nUsername: @${username || "Unknown"}`
    );
  } catch (error) {
    console.error("Error sending user start information to database channel:", error.message);
  }
};

// Function to process an image
const processImage = async (fileUrl, chatId, username) => {
  const imagePath = path.join(__dirname, "input.jpg");
  const outputPath = path.join(__dirname, "output.png");

  try {
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(imagePath, response.data);

    const formData = new FormData();
    formData.append("image_file", fs.createReadStream(imagePath));
    formData.append("size", "auto");

    const removeBgResponse = await axios.post(
      "https://api.remove.bg/v1.0/removebg",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "X-Api-Key": removeBgApiKey,
        },
        responseType: "arraybuffer",
      }
    );

    fs.writeFileSync(outputPath, removeBgResponse.data);

    await bot.sendPhoto(chatId, outputPath, {
      caption: "Converted by @awt_bgremover_bot",
    });

    await sendToDatabase(outputPath, username);
  } catch (error) {
    console.error("Error processing image:", error.message);
    await bot.sendMessage(chatId, "Failed to process the image. Please try again later.");
  } finally {
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
};

// Function to prompt users to join the channel
const askToJoin = async (chatId) => {
  await bot.sendMessage(
    chatId,
    `You must join our channel ${requiredChannel} to use this bot.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Join Channel", url: `https://t.me/${requiredChannel.slice(1)}` }],
          [{ text: "I Have Joined", callback_data: "joined_channel" }],
        ],
      },
    }
  );
};

// Handle callback queries for "I Have Joined" button
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "joined_channel") {
    const isMember = await isMemberOfChannel(chatId);
    if (isMember) {
      await bot.sendMessage(chatId, "Thank you for joining! You can now use the bot.");
    } else {
      await bot.sendMessage(
        chatId,
        `It seems you haven't joined ${requiredChannel} yet. Please join and try again.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Join Channel", url: `https://t.me/${requiredChannel.slice(1)}` }],
            ],
          },
        }
      );
    }
  }
});

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "Unknown";

  userData[chatId] = {
    username,
    firstName: msg.from.first_name,
    lastName: msg.from.last_name || "",
  };

  await bot.sendMessage(
    chatId,
    `Welcome, ${msg.from.first_name}! Send a photo or image document to remove its background.`
  );

  await notifyDatabaseOnStart(username); // Notify the database channel when a user starts the bot
});

// Handle user messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "Unknown";

  if (msg.photo || msg.document) {
    // Send "Processing" message and store its message ID
    const processingMessage = await bot.sendMessage(chatId, "Processing your image... Please wait!");

    try {
      const fileId = msg.photo
        ? msg.photo[msg.photo.length - 1].file_id
        : msg.document.file_id;
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${file.file_path}`;

      await processImage(fileUrl, chatId, username);

      // Delete the "Processing" message after sending the output
      await bot.deleteMessage(chatId, processingMessage.message_id);
    } catch (error) {
      console.error("Error getting file URL:", error.message);
      bot.sendMessage(chatId, "Failed to retrieve the file. Please try again later.");
      // Ensure "Processing" message is deleted even if there's an error
      await bot.deleteMessage(chatId, processingMessage.message_id);
    }
  }

});

// Admin: Broadcast a message to all users
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (msg.chat.id.toString() !== adminId) return;

  const message = match[1];
  Object.keys(userData).forEach((userId) => {
    bot.sendMessage(userId, `Broadcast: ${message}`).catch((error) => {
      console.error(`Failed to send message to ${userId}:`, error.message);
    });
  });
});

// Admin: List total users
bot.onText(/\/total_users/, (msg) => {
  if (msg.chat.id.toString() !== adminId) return;

  const totalUsers = Object.values(userData).length;
  const usersWithUsernames = Object.values(userData).filter((u) => u.username !== "Unknown");
  bot.sendMessage(
    msg.chat.id,
    `Total users: ${totalUsers}\nUsers with usernames: ${usersWithUsernames.length}`
  );
});

console.log("Telegram bot is running...");

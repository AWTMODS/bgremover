const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

// Your bot token from BotFather
const telegramToken = "7603494053:AAHhpqQKLItdNFPoOGI-oq2ZMsDGfQ0-KrM"; // Replace with your bot token
const removeBgApiKey = "zZFYAM1LsodBAK7CQo9xshCa"; // Replace with your remove.bg API key

// Create a new Telegram bot instance
const bot = new TelegramBot(telegramToken, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (msg.photo) {
    // Notify the user that processing is starting
    bot.sendMessage(chatId, "Processing your image... Please wait!");

    // Get the highest resolution photo
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    try {
      // Get the file URL
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${file.file_path}`;

      // Download the file
      const imagePath = path.join(__dirname, "input.jpg");
      const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(imagePath, response.data);

      // Ensure the file exists before proceeding
      if (!fs.existsSync(imagePath)) {
        throw new Error("Input file not found");
      }

      // Create form data for remove.bg API
      const formData = new FormData();
      formData.append("image_file", fs.createReadStream(imagePath));
      formData.append("size", "auto");

      // Send the file to remove.bg
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

      // Save the processed image
      const outputPath = path.join(__dirname, "output.png");
      fs.writeFileSync(outputPath, removeBgResponse.data);

      // Ensure the output file exists before sending it
      if (!fs.existsSync(outputPath)) {
        throw new Error("Output file not generated");
      }

      // Send the processed image back to the user
      await bot.sendPhoto(chatId, outputPath);

      // Clean up files
      fs.unlinkSync(imagePath);
      fs.unlinkSync(outputPath);
    } catch (error) {
      console.error("Error processing image:", error);
      bot.sendMessage(
        chatId,
        "Failed to process the image. Please try again later."
      );
    }
  } else {
    // Inform the user if no image is provided
    bot.sendMessage(chatId, "Please send a photo to remove the background.");
  }
});

console.log("Telegram bot is running...");

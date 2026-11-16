// ==================================================================================
// SendMessageToDiscord.js
//
// Notification Event Script for Discord
// Version: V1.0.1 //20260730
// Author: Apoorva Iyer
// Website: https://www.instagram.com/apoorva_iyer
// Target runtime: PixInsight PJSR 2.0 (V8).
// Helper include for SendMessageToPhone and NotificationEventScript.
//
// ==================================================================================

//#include "KoalaUtils.js"

/**
 * Sends a plain text message to a Discord webhook.
 * @param {string} webhookUrl - The Discord webhook URL.
 * @param {string} message - The message content to send.
 */
function sendMessageToDiscord(webhookUrl, message) {
  if (!webhookUrl) {
    printError("Discord webhook URL is not configured.");
    return false;
  }

  // Construct the JSON payload
  var payload = {
    content: message
  };
  var jsonPayload = JSON.stringify(payload);

  var args = [
    "-s",
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-d", jsonPayload,
    webhookUrl
  ];

  // Execute curl command
  var exitCode = executeCurl(args);

  if (exitCode !== 0) {
    printError('Failed to send message to Discord. Curl exit code: ' + exitCode);
    return false;
  } else {
    printInfo('Message successfully sent to Discord!');
    return true;
  }
}

/**
 * Sends an image to a Discord webhook.
 * @param {string} imagePath - The local path to the image file.
 * @param {string} webhookUrl - The Discord webhook URL.
 * @param {string} message - The message content to send with the image.
 */
function sendImageToDiscord(imagePath, webhookUrl, message) {
  if (!webhookUrl) {
    printError("Discord webhook URL is not configured.");
    return false;
  }

  // Construct the JSON payload for the multipart request
  var payload = {
    content: message
  };
  var jsonPayload = JSON.stringify(payload);

  var args = [
    '-s',
    '-X', 'POST',
    webhookUrl,
    '-F', 'payload_json=' + jsonPayload,
    '-F', 'file1=@' + imagePath
  ];

  // Execute curl command
  var exitCode = executeCurl(args);

  // Check if the request was successful
  if (exitCode !== 0) {
    printError('Failed to send photo to Discord. Curl exit code: ' + exitCode);
    return false;
  } else {
    printInfo('Photo successfully sent to Discord!');
    return true;
  }
}

/**
 * Processes an image window (duplicates, stretches, downsamples) and sends it to Discord.
 * @param {ImageWindow} imageWindow - The source image window.
 * @param {string} webhookUrl - The Discord webhook URL.
 * @param {string} message - The caption for the image.
 * @param {boolean} doStretch - Whether to apply an auto-stretch to the image.
 * @param {boolean} linked - Whether to use a linked stretch.
 */
function processAndSendImageToDiscord(
  imageWindow,
  webhookUrl,
  message,
  doStretch,
  linked
) {
  // Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'DiscordProcessed');
  if (!duplicateWindow || duplicateWindow.isNull) {
    return false;
  }

  try {
    // Apply auto-stretch if the flag is set
    if (doStretch == true) {
      applyAutoStretch(duplicateWindow.mainView, linked);
    }

    // Downsample if necessary to meet Discord's 8MB file limit (heuristic)
    var width = duplicateWindow.mainView.image.width;
    var height = duplicateWindow.mainView.image.height;
    var resampleFactor = 1;

    while (width / resampleFactor * height / resampleFactor * 3 > 8 * 1024 * 1024) {
        resampleFactor++;
    }

    if (resampleFactor > 1) {
      downsampleImage(duplicateWindow.mainView, -resampleFactor);
    }

    // Save the image as JPEG
    var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'DiscordProcessed');
    if (!jpegPath) {
        printError("Failed to save image for Discord, aborting send.");
        return false;
    }
    console.noteln('JPEG saved at: ' + jpegPath);

    // Send the image via Discord
    return sendImageToDiscord(jpegPath, webhookUrl, message);
  } finally {
    if (duplicateWindow && !duplicateWindow.isNull) {
      duplicateWindow.forceClose();
    }
  }
}

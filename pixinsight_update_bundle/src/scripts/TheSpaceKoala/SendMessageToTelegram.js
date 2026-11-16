// ==================================================================================
// SendMessageToTelegram.js
//
// Copyright (c) 2025 Luca Bartek
// Notification Event Script
// Version: V1.0.1 //20250521
// Author: Luca Bartek
// Website: www.thespacekoala.com
//
// Redistribution and use in both source and binary forms, with or without
// modification, is permitted provided that the following conditions are met:
//
// 1. All redistributions of source code must retain the above copyright
//    notice, this list of conditions and the following disclaimer.
//
// 2. All redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// ==================================================================================

//#include "KoalaUtils.js"


// Function to send a Telegram message
function sendMessageToTelegram(botToken, chatId, message) {
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var args = [
    "-s", "-X", "POST",
    url,
    "-d", "chat_id=" + chatId,
    "-d", "text=" + message
  ];

  var p = new ExternalProcess();
  ExternalProcess.execute('curl', args);
}


function sendImageToTelegram(imagePath, telegramToken, chatId, message) {
  const url = 'https://api.telegram.org/bot' + telegramToken + '/sendPhoto';
  let args = [
    '-s',
    '-X',
    'POST',
    url,
    '-F',
    'chat_id=' + chatId,
    '-F',
    'photo=@' + imagePath,
  ];

  if (message) {
    args[args.length] = '-F';
    args[args.length] = 'caption=' + message;
  }

  // Execute curl command
  let exitCode = ExternalProcess.execute('curl', args);

  // Check if the request was successful
  if (exitCode !== 0) {
    printError('Failed to send photo. Curl exit code: ' + exitCode);
  } else {
    printInfo('Photo successfully sent to Telegram!');
  }
}

function processAndSendImageToTelegram(
  imageWindow,
  telegramToken,
  telegramChatId,
  message,
  doStretch,
  linked
) {
  // Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'TelegramProcessed');

  // Apply auto-stretch if the flag is set
  if (doStretch == true) {
    applyAutoStretch(duplicateWindow.mainView, linked);
  }

  var width = duplicateWindow.mainView.image.width;
  var height = duplicateWindow.mainView.image.height;
  var resampleFactor = 1;

  // Loop to resample the image if necessary
  while (width / resampleFactor + height / resampleFactor > 10000) {
    resampleFactor++;
  }

  // Downsample if necessary
  if (resampleFactor > 1) {
    downsampleImage(duplicateWindow.mainView, -resampleFactor);
  }

  // Save the image as JPEG
  var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'TelegramProcessed');
  console.noteln('JPEG saved at: ' + jpegPath);

  // Send the image via Telegram
  sendImageToTelegram(jpegPath, telegramToken, telegramChatId, message);

  // Close the duplicate window after processing
  duplicateWindow.forceClose();
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
//        _____ _                                                         //
//       |_   _| |__   ___                                                //
//         | | | '_ \ / _ \                                               //
//         | | | | | |  __/                                               //
//         |_| |_| |_|\___|          _  __           _                    //
//       / ___| _ __   __ _  ___ ___| |/ /___   __ _| | __ _              //
//       \___ \| '_ \ / _` |/ __/ _ \ ' // _ \ / _` | |/ _` |             //
//        ___) | |_) | (_| | (_|  __/ . \ (_) | (_| | | (_| |             //
//       |____/| .__/ \__,_|\___\___|_|\_\___/ \__,_|_|\__,_|             //
//             |_|                                                        //
////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
//
// Notification Event Script
// Version: V1.0.2 //20250521
// Author: Luca Bartek
// Website: www.thespacekoala.com
//
// Original text-based Telegram notification script idea & implementation by Marco Manenti as per
// https://github.com/verbavolant/eventSendMessageToTelegram
//
// Pushover idea and implementation by Brian Weber, see
// https://blog.briangweber.com/pushover-setup/
//
// This script should be used via the WeightedBatchPreProcessing script of PixInsight.
// It cannot be run standalone.
//
// This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.
// To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/
//
// You are free to:
// 1. Share — copy and redistribute the material in any medium or format
// 2. Adapt — remix, transform, and build upon the material
//
// Under the following terms:
// 1. Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
//    You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
// 2. NonCommercial — You may not use the material for commercial purposes.
//
// @license CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/)
//
// COPYRIGHT © 2025 Luca Bartek. ALL RIGHTS RESERVED.
////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////
//@todo temporary redecleration of a bunch of stuff - to be removed once I know how to import them
////////////////////////////////////////////////////////////////////////////
var PLATFORMS = {
  TELEGRAM: 1,
  IMESSAGE: 2,
  PUSHOVER: 3,
};

if (typeof SendMessageToPhoneConstants === 'undefined')
  SendMessageToPhoneConstants = {};

SendMessageToPhoneConstants.PHONE_PLATFORM_KEY = 'SendMessageToPhone/platform';
SendMessageToPhoneConstants.TELEGRAM_TOKEN_KEY = 'SendMessageToPhone/telegramBotToken';
SendMessageToPhoneConstants.TELEGRAM_CHAT_ID_KEY = 'SendMessageToPhone/telegramChatId';
SendMessageToPhoneConstants.MESSAGE_KEY = 'SendMessageToPhone/message';
SendMessageToPhoneConstants.IMESSAGE_RECIPIENT_KEY = 'SendMessageToPhone/imessageRecipient';
SendMessageToPhoneConstants.PUSHOVER_USER_KEY = 'SendMessageToPhone/pushoverUser';
SendMessageToPhoneConstants.PUSHOVER_TOKEN_KEY = 'SendMessageToPhone/pushoverToken';
SendMessageToPhoneConstants.DO_STRETCH_KEY = 'SendMessageToPhone/doStretch';
SendMessageToPhoneConstants.LINKED_KEY = 'SendMessageToPhone/linked';


var savedConfig =  {
    platform:
      Settings.read(
        SendMessageToPhoneConstants.PHONE_PLATFORM_KEY,
        5 //DataType_Int32
      ) || PLATFORMS.TELEGRAM,
    telegramBotToken:
      Settings.read(
        SendMessageToPhoneConstants.TELEGRAM_TOKEN_KEY,
        14 //DataType_UCString
      ) || '',
    telegramChatId: (function () {
      var v = Settings.read(
        SendMessageToPhoneConstants.TELEGRAM_CHAT_ID_KEY,
        14 //DataType_UCString
      );
      return typeof v === 'undefined' ? 0 : v;
    })(),
    message:
      Settings.read(
        SendMessageToPhoneConstants.MESSAGE_KEY,
        14 //DataType_UCString
      ) || ':)',
    imessageRecipient:
      Settings.read(
        SendMessageToPhoneConstants.IMESSAGE_RECIPIENT_KEY,
        14 //DataType_UCString
      ) || '',
    pushoverUser:
      Settings.read(
        SendMessageToPhoneConstants.PUSHOVER_USER_KEY,
        14 //DataType_UCString
      ) || '',
    pushoverToken:
      Settings.read(
        SendMessageToPhoneConstants.PUSHOVER_TOKEN_KEY,
        14 //DataType_UCString
      ) || '',
  };

let sendMessage = function (
  platform,
  telegramToken,
  telegramChatId,
  imessageRecipient,
  pushoverUser,
  pushoverToken,
  message
) {

 if (platform === PLATFORMS.TELEGRAM) {
    sendMessageToTelegram(
      telegramToken,
      telegramChatId,
      message
    );
  } else if (platform === PLATFORMS.IMESSAGE) {
   sendMessageToIMessage(
      imessageRecipient,
      message
    );
  } else if (platform === PLATFORMS.PUSHOVER) {
    sendMessageToPushover(
      pushoverUser,
      pushoverToken,
      message
    );
  } else {
    printError('Please configure platform in the SendMessageToPhone script');
  }
}


let sendMessageToTelegram = function (botToken, chatId, message) {
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


let sendImageToTelegram = function (imagePath, telegramToken, chatId, message) {
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

let processAndSendImageToTelegram = function (
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


// Function to send an iMessage
let sendMessageToIMessage = function (recipient, message) {
  if (CoreApplication.platform != "macOS") {
    Console.criticalln("iMessage sending is only available on macOS.");
    return;
  }

  var script = 'tell application "Messages"\n'
             + 'set targetService to first service whose service type = iMessage\n'
             + 'set targetBuddy to buddy \"' + recipient + '\" of targetService\n'
             + 'send \"' + message + '\" to targetBuddy\n'
             + 'end tell';

   console.noteln('script ' + script);
  var p = new ExternalProcess();
   p.start("osascript", ["-e", script]);
   p.waitForFinished();

      if (p.exitCode === 0) {
      Console.writeln("Message sent successfully.");
   } else {
      Console.criticalln("Error sending message: " + p.stderr);
   }
}



// Function to send image via iMessage
let sendImageToIMessage = function (imagePath, imessageRecipient, message) {
  if (!CoreApplication.platform == "macOS") {
    printError("iMessage sending is only available on macOS.");
    return;
  }

  // Define AppleScript for iMessage
  var script =
    'tell application "Messages"\n' +
    'set targetService to first service whose service type = iMessage\n' +
    'set targetBuddy to buddy "' +
    imessageRecipient +
    '" of targetService\n' +
    'send "' +
    message +
    '" to targetBuddy\n' +
    'send POSIX file "' +
    imagePath +
    '" to targetBuddy\n' +
    'end tell';

   console.noteln('script ' + script);
  var p = new ExternalProcess();
   p.start("osascript", ["-e", script]);
   p.waitForFinished();

      if (p.exitCode === 0) {
      Console.writeln("Message sent successfully.");
   } else {
      Console.criticalln("Error sending message: " + p.stderr);
   }
}

let processAndSendImageToIMessage = function (
  imageWindow,
  imessageRecipient,
  message,
  doStretch,
  linked
){
  // Step 1: Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'foobar23204');

  // Step 2: Auto-stretch the image (if needed)
  if (doStretch) {
    applyAutoStretch(
      duplicateWindow.mainView,
      linked
    );
  }

  // Step 3: Save the image as JPEG
  var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'iMessageProcessed');
  console.noteln('jpegPath ' + jpegPath);

  // Step 4: Send the image via iMessage
  sendImageToIMessage(jpegPath, imessageRecipient, message);

  // Step 5: Close the duplicate window
  duplicateWindow.forceClose();
}

// Function to send a Pushover message
let sendMessageToPushover = function (userKey, appToken, message) {
  var url = "https://api.pushover.net/1/messages.json";
  var args = [
    "-s", "-X", "POST",
    url,
    "-d", "token=" + appToken,
    "-d", "user=" + userKey,
    "-d", "message=" + message
  ];

  var p = new ExternalProcess();
  ExternalProcess.execute('curl', args);
}


 let sendImageToPushover = function (imagePath, userKey, appToken, caption) {
  var url = "https://api.pushover.net/1/messages.json";
  var args = [
    "-s", "-X", "POST",
    url,
    "-F", "token=" + appToken,
    "-F", "user=" + userKey,
    "-F", "message=" + caption,
    "-F", "attachment=@" + imagePath
  ];
  console.noteln('imagePath '+imagePath);

  // Execute curl command
  let exitCode = ExternalProcess.execute('curl', args);

  // Check if the request was successful
  if (exitCode !== 0) {
    printError('Failed to send photo. Curl exit code: ' + exitCode);
  } else {
    printInfo('Photo successfully sent to Pushover!');
  }
}

let processAndSendImageToPushover = function (
  imageWindow,
  userKey,
  appToken,
  message,
  doStretch,
  linked
) {
  // Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'PushoverProcessed');

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
  var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'PushoverProcessed');
  console.noteln('JPEG saved at: ' + jpegPath);

  // Send the image
  sendImageToPushover(jpegPath, userKey, appToken, message);

  // Close the duplicate window after processing
  duplicateWindow.forceClose();
}


let sendImage = function (
  targetWindow,
  platform,
  telegramToken,
  telegramChatId,
  imessageRecipient,
  pushoverUser,
  pushoverToken,
  message,
  doStretch,
  linked
) {
 if (platform === PLATFORMS.TELEGRAM) {
  // For Telegram, use telegramToken and telegramChatId
    processAndSendImageToTelegram(
      targetWindow,
      telegramToken, // Telegram Bot Token
      telegramChatId, // Telegram Chat ID
      message, // Message text (shared for both platforms)
      doStretch, // Pass doStretch
      linked // Pass linked
    );
  } else if (platform === PLATFORMS.IMESSAGE) {
    // For iMessage, use imessageRecipient
    processAndSendImageToIMessage(
      targetWindow,
      imessageRecipient, // iMessage recipient
      message, // Message text (shared for both platforms)
      doStretch, // Pass doStretch
      linked // Pass linked
    );
  }  else if (platform === PLATFORMS.PUSHOVER) {
    processAndSendImageToPushover(
      targetWindow,
      pushoverUser,
      pushoverToken,
      message,
      doStretch,
      linked
    );
  }
  else {
    printError('Unknown platform!');
  }
}

////////////////////////////////////////////////////////////////////////////
//@end of temporary redecleration of contents of SendMessageToPhone.js - to be removed once I know how to import them
////////////////////////////////////////////////////////////////////////////

let sendEventScriptMessage = function (message) {
sendMessage(
  savedConfig.platform,
  savedConfig.telegramBotToken,
  savedConfig.telegramChatId.toNumber(),
  savedConfig.imessageRecipient,
  savedConfig.pushoverUser,
  savedConfig.pushoverToken,
  message
)
};

// Function to process, autostretch, and send the stacked image
let sendStackedImage = function (imageToSend, caption) {
  // Step 1: Open the stacked image
  let [window] = ImageWindow.open(imageToSend);
  if (!window) {
    console.criticalln('Failed to open the stacked image.');
    return;
  }
    sendImage(
    window,
    savedConfig.platform,
    savedConfig.telegramBotToken,
    savedConfig.telegramChatId,
    savedConfig.imessageRecipient,
    savedConfig.pushoverUser,
    savedConfig.pushoverToken,
    caption,
    true,
    false
  );
}


if (env.event == 'start') {
  if (env.group) {
    let totalFramesCount = env.group.fileItems.length;
    let activeFramesCount = env.group.activeFrames().length;

    sendEventScriptMessage(
      env.name +
        ' starting: processing ' +
        activeFramesCount +
        '/' +
        totalFramesCount +
        ' active frames'
    );
  } else {
    sendEventScriptMessage(env.name);

  }
}

if (env.event == 'done') {
  if (env.status == OperationBlockStatus.DONE) {
    sendEventScriptMessage(env.name + ' successfully executed');
  } else if (env.status == OperationBlockStatus.FAILED) {
    sendEventScriptMessage(env.name + ' failed, ' + env.statusMessage);
  }
}

// Ensure env exists before accessing properties
if (typeof env !== 'undefined' && env.name) {
  if (
    (env.name == 'Integration' || env.name == 'FastIntegration') &&
    env.event == 'done'
  ) {
    sendStackedImage(
      env.group.getMasterFileName(
        WBPPMasterType.MASTER_LIGHT,
        WBPPMasterVariant.REGULAR
      ),
      'Your integrated Master Light file is here!'
    );
  } else if (env.name == 'Drizzle Integration' && env.event == 'done') {
    sendStackedImage(
      env.group.getMasterFileName(
        WBPPMasterType.MASTER_LIGHT,
        WBPPMasterVariant.DRIZZLE
      ),
      'Your integrated Drizzle file is here!'
    );
  } else if (env.name.indexOf('onPostProcessEnd') == 0 && env.event == 'done') {
    customFinalSteps = true;
  }
}
if (env.event == 'pipeline start') {
  sendEventScriptMessage('WBPP started.');
}

if (env.event === 'pipeline end') {
  sendEventScriptMessage('WBPP terminated.');
}

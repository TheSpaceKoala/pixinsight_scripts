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
// Version: V1.0.5 //20260801
// Author: Luca Bartek
// Website: www.thespacekoala.com
// Target runtime: PixInsight PJSR 2.0 (V8).
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
  DISCORD: 4,
};

var SendMessageToPhoneConstants = {
  PHONE_PLATFORM_KEY: 'SendMessageToPhone/platform',
  TELEGRAM_TOKEN_KEY: 'SendMessageToPhone/telegramBotToken',
  TELEGRAM_CHAT_ID_KEY: 'SendMessageToPhone/telegramChatId',
  MESSAGE_KEY: 'SendMessageToPhone/message',
  IMESSAGE_RECIPIENT_KEY: 'SendMessageToPhone/imessageRecipient',
  PUSHOVER_USER_KEY: 'SendMessageToPhone/pushoverUser',
  PUSHOVER_TOKEN_KEY: 'SendMessageToPhone/pushoverToken',
  DISCORD_WEBHOOK_URL_KEY: 'SendMessageToPhone/discordWebhookUrl',
  DO_STRETCH_KEY: 'SendMessageToPhone/doStretch',
  LINKED_KEY: 'SendMessageToPhone/linked',
};

// WBPP evaluates event scripts as plain JavaScript, without processing
// #include directives. These helpers make this event-script bundle standalone.
var printDebug = function (msg) {
  console.noteln('[DEBUG] ' + msg);
};

var printInfo = function (msg) {
  console.writeln('[INFO] ' + msg);
};

var printError = function (msg) {
  console.criticalln('[ERROR] ' + msg);
};

var executeCurl = function (args) {
  var exitCode = ExternalProcess.execute('curl', args);
  var platform =
    typeof System != 'undefined'
      ? System.platform
      : CoreApplication.platform;
  var isWindows = platform == 'Windows' || platform == 'MSWINDOWS';

  if (isWindows && exitCode === 35) {
    printInfo(
      'Curl TLS handshake failed. Retrying with Windows revocation best-effort mode.'
    );
    var retryExitCode = ExternalProcess.execute(
      'curl',
      ['--ssl-revoke-best-effort'].concat(args)
    );

    if (retryExitCode === 2) {
      printError(
        'The installed curl does not support --ssl-revoke-best-effort. ' +
          'Please update curl to version 7.70.0 or newer.'
      );
      return exitCode;
    }

    return retryExitCode;
  }

  return exitCode;
};

var duplicateImageWindow = function (imageWindow, newId) {
  if (!imageWindow || imageWindow.isNull) {
    printError('Invalid image window provided for duplication.');
    return null;
  }

  var duplicateWindow = new ImageWindow(
    1,
    1,
    1,
    imageWindow.mainView.image.bitsPerSample,
    imageWindow.mainView.image.sampleType == SampleType_Real,
    false,
    newId
  );

  var duplicateView = duplicateWindow.mainView;
  duplicateView.beginProcess(UndoFlag_NoSwapFile);
  duplicateView.image.assign(imageWindow.mainView.image);
  duplicateView.id = newId;
  duplicateView.endProcess();

  printInfo('Image duplicated successfully with ID: ' + newId);
  return duplicateWindow;
};

var applyAutoStretch = function (view, linked) {
  if (!view || view.isNull) {
    printError('Invalid view provided for auto-stretching.');
    return;
  }

  var P = new PixelMath();
  if (linked == true) {
    P.expression =
      '//autostretch\n' +
      'm = (med( $T[0] ) + med( $T[1] ) + med( $T[2] ))/3;\n' +
      'd = (mdev( $T[0] ) + mdev( $T[1] ) + mdev( $T[2] ))/3;\n' +
      'c = min( max( 0, m + C*1.4826*d ), 1 );\n' +
      'mtf( mtf( B, m - c ), max( 0, ($T - c)/~c ) )\n';
  } else {
    P.expression =
      '//autostretch\n' +
      'c = min( max( 0, med( $T ) + C*1.4826*mdev( $T ) ), 1 );\n' +
      'mtf( mtf( B, med( $T ) - c ), max( 0, ($T - c)/~c ) )';
  }

  P.useSingleExpression = true;
  P.symbols = 'C = -2.8,\nB = 0.25,\nc,\nm,\nd';
  P.createNewImage = false;
  P.executeOn(view);
};

var downsampleImage = function (view, factor) {
  if (!view || view.isNull) {
    printError('Invalid view provided for downsampling.');
    return;
  }

  var P = new IntegerResample();
  P.zoomFactor = factor;
  P.downsamplingMode = IntegerResample.Average;
  P.noGUIMessages = true;
  P.executeOn(view);
};

var saveImageAsJpeg = function (imageWindow, directory, filename) {
  if (!imageWindow || imageWindow.isNull) {
    printError('Invalid image window provided for JPEG export.');
    return null;
  }

  var outputDirectory = directory ? directory : File.systemTempDirectory;
  var sanitizedFilename = filename.replace(/\.(jpg|jpeg)$/i, '') + '.jpg';
  var jpegPath = outputDirectory + '/' + sanitizedFilename;
  var success = imageWindow.saveAs(
    jpegPath,
    false,
    false,
    false,
    false,
    'quality=80'
  );

  if (!success) {
    printError('Failed to save image as JPEG.');
    return null;
  }

  return jpegPath;
};


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
    discordWebhookUrl:
      Settings.read(
        SendMessageToPhoneConstants.DISCORD_WEBHOOK_URL_KEY,
        14 //DataType_UCString
      ) || '',
  };

var sendMessage = function (
  platform,
  telegramToken,
  telegramChatId,
  imessageRecipient,
  pushoverUser,
  pushoverToken,
  discordWebhookUrl,
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
  } else if (platform === PLATFORMS.DISCORD) {
    sendMessageToDiscord(
      discordWebhookUrl,
      message
    );
  } else {
    printError('Please configure platform in the SendMessageToPhone script');
  }
}


var sendMessageToTelegram = function (botToken, chatId, message) {
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  var args = [
    "-s", "-X", "POST",
    url,
    "-d", "chat_id=" + chatId,
    "-d", "text=" + message
  ];

  return executeCurl(args) === 0;
}


var sendImageToTelegram = function (imagePath, telegramToken, chatId, message) {
  var url = 'https://api.telegram.org/bot' + telegramToken + '/sendPhoto';
  var args = [
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
  var exitCode = executeCurl(args);

  // Check if the request was successful
  if (exitCode !== 0) {
    printError('Failed to send photo. Curl exit code: ' + exitCode);
  } else {
    printInfo('Photo successfully sent to Telegram!');
  }
}

var processAndSendImageToTelegram = function (
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
var sendMessageToIMessage = function (recipient, message) {
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
var sendImageToIMessage = function (imagePath, imessageRecipient, message) {
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

var processAndSendImageToIMessage = function (
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
var sendMessageToPushover = function (userKey, appToken, message) {
  var url = "https://api.pushover.net/1/messages.json";
  var args = [
    "-s", "-X", "POST",
    url,
    "-d", "token=" + appToken,
    "-d", "user=" + userKey,
    "-d", "message=" + message
  ];

  return executeCurl(args) === 0;
}


var sendImageToPushover = function (imagePath, userKey, appToken, caption) {
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
  var exitCode = executeCurl(args);

  // Check if the request was successful
  if (exitCode !== 0) {
    printError('Failed to send photo. Curl exit code: ' + exitCode);
  } else {
    printInfo('Photo successfully sent to Pushover!');
  }
}

var sendMessageToDiscord = function (webhookUrl, message) {
  if (!webhookUrl) {
    printError("Discord webhook URL is not configured.");
    return false;
  }

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

  var exitCode = executeCurl(args);

  if (exitCode !== 0) {
    printError('Failed to send message to Discord. Curl exit code: ' + exitCode);
    return false;
  } else {
    printInfo('Message successfully sent to Discord!');
    return true;
  }
};

var sendImageToDiscord = function (imagePath, webhookUrl, message) {
  if (!webhookUrl) {
    printError("Discord webhook URL is not configured.");
    return false;
  }

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

  var exitCode = executeCurl(args);

  if (exitCode !== 0) {
    printError('Failed to send photo to Discord. Curl exit code: ' + exitCode);
    return false;
  } else {
    printInfo('Photo successfully sent to Discord!');
    return true;
  }
};

var processAndSendImageToDiscord = function (
  imageWindow,
  webhookUrl,
  message,
  doStretch,
  linked
) {
  var duplicateWindow = duplicateImageWindow(imageWindow, 'DiscordProcessed');
  if (!duplicateWindow || duplicateWindow.isNull) {
    return false;
  }

  try {
    if (doStretch == true) {
      applyAutoStretch(duplicateWindow.mainView, linked);
    }

    var width = duplicateWindow.mainView.image.width;
    var height = duplicateWindow.mainView.image.height;
    var resampleFactor = 1;

    while (width / resampleFactor * height / resampleFactor * 3 > 8 * 1024 * 1024) {
      resampleFactor++;
    }

    if (resampleFactor > 1) {
      downsampleImage(duplicateWindow.mainView, -resampleFactor);
    }

    var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'DiscordProcessed');
    if (!jpegPath) {
      printError("Failed to save image for Discord, aborting send.");
      return false;
    }
    console.noteln('JPEG saved at: ' + jpegPath);

    return sendImageToDiscord(jpegPath, webhookUrl, message);
  } finally {
    if (duplicateWindow && !duplicateWindow.isNull) {
      duplicateWindow.forceClose();
    }
  }
};

var processAndSendImageToPushover = function (
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


var sendImage = function (
  targetWindow,
  platform,
  telegramToken,
  telegramChatId,
  imessageRecipient,
  pushoverUser,
  pushoverToken,
  discordWebhookUrl,
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
  } else if (platform === PLATFORMS.DISCORD) {
    processAndSendImageToDiscord(
      targetWindow,
      discordWebhookUrl,
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

var sendEventScriptMessage = function (message) {
sendMessage(
  savedConfig.platform,
  savedConfig.telegramBotToken,
  savedConfig.telegramChatId.toNumber(),
  savedConfig.imessageRecipient,
  savedConfig.pushoverUser,
  savedConfig.pushoverToken,
  savedConfig.discordWebhookUrl,
  message
)
};

// Function to process, autostretch, and send the stacked image
var sendStackedImage = function (imageToSend, caption) {
  // Step 1: Open the stacked image
  var [window] = ImageWindow.open(imageToSend);
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
    savedConfig.discordWebhookUrl,
    caption,
    true,
    false
  );
}


if (env.event == 'start') {
  if (env.group) {
    var totalFramesCount = env.group.fileItems.length;
    var activeFramesCount = env.group.activeFrames().length;

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
        BPP.MasterType.MASTER_LIGHT,
        BPP.MasterVariant.REGULAR
      ),
      'Your integrated Master Light file is here!'
    );
  } else if (env.name == 'Drizzle Integration' && env.event == 'done') {
    sendStackedImage(
      env.group.getMasterFileName(
        BPP.MasterType.DRIZZLE,
        BPP.MasterVariant.REGULAR
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

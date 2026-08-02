// ==================================================================================
// SendMessageToIMessage.js
//
// Copyright (c) 2025 Luca Bartek
// Notification Event Script
// Version: V1.0.2 //20250521
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


// Function to send an iMessage
function sendMessageToIMessage(recipient, message) {
  if (CoreApplication.platform != "macOS") {
    Console.criticalln("iMessage sending is only available on macOS.");
    return;
  }

  var script = 'tell application "Messages"\n'
             + 'set targetService to first service whose service type = iMessage\n'
             + 'set targetBuddy to buddy \"' + recipient + '\" of targetService\n'
             + 'send \"' + message + '\" to targetBuddy\n'
             + 'end tell';

  var p = new ExternalProcess();
   p.start("osascript", ["-e", script]);
   p.waitForFinished();

      if (p.exitCode === 0) {
      Console.writeln("✅ Message sent successfully.");
   } else {
      Console.criticalln("❌ Error sending message: " + p.stderr);
   }
}


// Function to send image via iMessage
function sendImageToIMessage(imagePath, imessageRecipient, message) {
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

  var p = new ExternalProcess();
   p.start("osascript", ["-e", script]);
   p.waitForFinished();

      if (p.exitCode === 0) {
      Console.writeln("✅ Message sent successfully.");
   } else {
      Console.criticalln("❌ Error sending message: " + p.stderr);
   }
}

function processAndSendImageToIMessage(
  imageWindow,
  imessageRecipient,
  message,
  doStretch,
  linked
) {
  // Step 1: Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'foobar23204');
// Step 2: Auto-stretch the image (if needed)
  if (doStretch === true) {
      applyAutoStretch(
        duplicateWindow.mainView      );
  }

  // Step 3: Save the image as JPEG
  var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'iMessageProcessed');

  // Step 4: Send the image via iMessage
  sendImageToIMessage(jpegPath, imessageRecipient, message);

  // Step 5: Close the duplicate window
  duplicateWindow.forceClose();
}

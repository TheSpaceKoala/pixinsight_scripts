// ==================================================================================
// SendMessageToPushover.js
//
// Copyright (c) 2025 Luca Bartek, Brian Weber
// Send Message to Pushover
// Version: V1.0.1 //20250521
// Author: Luca Bartek, Brian Weber
// Website: thespacekoala.com, briangweber.com
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
// ==================================================================================


// Function to send a Pushover message
function sendMessageToPushover(userKey, appToken, message) {
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


function sendImageToPushover(imagePath, userKey, appToken, caption) {
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

function processAndSendImageToPushover(
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

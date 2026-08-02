// ==================================================================================
// SendImageToTelegram.js - A PixInsight script to process an image and send it to Telegram
//
// Copyright (c) 2025 Luca Bartek
// Notification Event Script
// Version: V1.0.1 -
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

#include       <pjsr/StdButton.jsh>
#include       <pjsr/StdIcon.jsh>
#include       <pjsr/StdCursor.jsh>
#include       <pjsr/Sizer.jsh>
#include       <pjsr/FrameStyle.jsh>
#include       <pjsr/NumericControl.jsh>
#include       <pjsr/DataType.jsh>
#include       <pjsr/SampleType.jsh>
#include       <pjsr/UndoFlag.jsh>
#include       "KoalaUtils.js"

#define TITLE "Send Image To Telegram"
#define VERSION "V1.0.8" // 20250505

this.TELEGRAM_SETTINGS_KEY_BASE = 'SendImageToTelegram/';

function loadTelegramSettings() {
  var telegramBotToken = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken',
    DataType_UCString
  );
  var chatID = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'chatID',
    DataType_UCString
  );
  if (chatID == -2147483648) {
    chatID = Number.NaN;
  }
  var doStretch = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'doStretch',
    DataType_Boolean
  );
  var linked = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'linked',
    DataType_Boolean
  );
  var message =
    Settings.read(TELEGRAM_SETTINGS_KEY_BASE + 'message', DataType_UCString) ||
    '';

  return {
    telegramBotToken: telegramBotToken,
    chatID: chatID,
    doStretch: doStretch,
    linked: linked,
    message: message,
  };
}

function resetTelegramSettings() {
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken');
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'chatID');
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'doStretch');
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'linked');
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'message');
}

function saveTelegramSettings(
  telegramBotToken,
  chatID,
  doStretch,
  linked,
  message
) {
  Settings.write(
    TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken',
    DataType_UCString,
    telegramBotToken
  );
  Settings.write(TELEGRAM_SETTINGS_KEY_BASE + 'chatID', DataType_UCString, chatID.toString());
  Settings.write(
    TELEGRAM_SETTINGS_KEY_BASE + 'doStretch',
    DataType_Boolean,
    doStretch
  );
  Settings.write(
    TELEGRAM_SETTINGS_KEY_BASE + 'linked',
    DataType_Boolean,
    linked
  );
  Settings.write(
    TELEGRAM_SETTINGS_KEY_BASE + 'message',
    DataType_UCString,
    message
  );
}

function validateInputs(token, chatID) {
  if (!token) {
    raiseError('Telegram Bot Token is mandatory.');
    return false;
  }
  if (token.startsWith('bot')) {
    raiseError('Insert the Bot Token without "bot"');
    return false;
  }
  if (!chatID || isNaN(chatID)) {
    raiseError('Chat ID is mandatory and must be a valid number.');
    return false;
  }
  return true;
}

function sendPhotoToTelegram(imagePath, telegramToken, chatId, message) {
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
console.noteln('args ' + args);

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
  chatId,
  doStretch,
  linked,
  message
) {
  // Duplicate the image window
  var duplicateWindow = duplicateImageWindow(imageWindow, 'foobar23204');

  if (doStretch) {
      applyAutoStretch(
        duplicateWindow.mainView,
        linked && duplicateWindow.mainView.image.isColor
      );
  }

  var width = duplicateWindow.mainView.image.width;
  var height = duplicateWindow.mainView.image.height;
  var resampleFactor = 1;

  // Loop until width + height is below 10,000
  while (width / resampleFactor + height / resampleFactor > 10000) {
    resampleFactor++;
  }
  if (resampleFactor > 1) {
    downsampleImage(duplicateWindow.mainView, -resampleFactor);
  }

  // Export image as JPEG
  var jpegPath = saveImageAsJpeg(duplicateWindow, null, 'TelegramProcessed');
  console.noteln('jpegPath ' + jpegPath);

  // Send the image via Telegram
  sendPhotoToTelegram(jpegPath, telegramToken, chatId, message);
  // Close the duplicate window
  duplicateWindow.forceClose();
}

function TelegramDialog() {
  this.__base__ = Dialog;
  this.__base__();

  this.windowTitle = 'Send Image to Telegram';
  // Load saved settings
  let savedConfig = loadTelegramSettings();
  // Telegram Token Input
  this.tokenLabel = new Label(this);
  this.tokenLabel.text = 'Telegram Bot Token:';
  this.tokenLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

  this.tokenInput = new Edit(this);
  this.tokenInput.text = savedConfig.telegramBotToken || '';
  this.tokenInput.setFixedWidth(350);

  let tokenSizer = new HorizontalSizer();
  tokenSizer.spacing = 4;
  tokenSizer.add(this.tokenLabel);
  tokenSizer.add(this.tokenInput, 100);

  // Chat ID Input
  this.chatIdLabel = new Label(this);
  this.chatIdLabel.text = 'Chat ID:';
  this.chatIdLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

  this.chatIdInput = new NumericEdit(this);
  this.chatIdInput.setRange(
    -99999999999999999999999999,
    99999999999999999999999999
  ); // Set a reasonable range
  this.chatIdInput.setPrecision(0); // No decimals
  this.chatIdInput.setValue(savedConfig.chatID.toNumber() || Number.NaN);
  this.chatIdInput.setFixedWidth(350);

  let chatIdSizer = new HorizontalSizer();
  chatIdSizer.spacing = 4;
  chatIdSizer.add(this.chatIdLabel);
  chatIdSizer.add(this.chatIdInput, 100);

  // === Message Input ===
  this.messageLabel = new Label(this);
  this.messageLabel.text = 'Message:';
  this.messageLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;

  this.messageInput = new Edit(this);
  this.messageInput.text = savedConfig.message || ''; // Load saved message
  this.messageInput.setFixedWidth(350);

  var messageSizer = new HorizontalSizer();
  messageSizer.spacing = 4;
  messageSizer.add(this.messageLabel);
  messageSizer.add(this.messageInput, 100);

  // === Auto-Stretch Checkbox ===
  this.autoStretchCheckbox = new CheckBox(this);
  this.autoStretchCheckbox.text = 'Auto-Stretch';
  this.autoStretchCheckbox.checked = savedConfig.doStretch || false;

  var autoStretchSizer = new HorizontalSizer();
  autoStretchSizer.spacing = 4;
  autoStretchSizer.addSpacing(20);
  autoStretchSizer.add(this.autoStretchCheckbox);
  autoStretchSizer.addStretch();

  // === Linked Checkbox (Only Active When Auto-Stretch is Enabled) ===
  this.linkedCheckbox = new CheckBox(this);
  this.linkedCheckbox.text = 'Linked Channels';
  this.linkedCheckbox.checked = savedConfig.linked || false;
  this.linkedCheckbox.enabled = this.autoStretchCheckbox.checked; // Initially enabled based on auto-stretch

  var linkedSizer = new HorizontalSizer();
  linkedSizer.spacing = 4;
  linkedSizer.addSpacing(20);
  linkedSizer.add(this.linkedCheckbox);
  linkedSizer.addStretch();

  // === Toggle Linked Checkbox Based on Auto-Stretch ===
  var self = this;
  this.autoStretchCheckbox.onCheck = function (checked) {
    self.linkedCheckbox.enabled = checked;
  };

  // === "New Instance" Button (Triangle Icon) ===
  this.newInstanceButton = new ToolButton(this);
  this.newInstanceButton.icon = this.scaledResource(
    ':/process-interface/new-instance.png'
  );
  this.newInstanceButton.setScaledFixedSize(24, 24);
  this.newInstanceButton.toolTip = 'New Instance';
  var self = this;
  this.newInstanceButton.onMousePress = function () {
    var P = new Object();

    // Save all parameters into P
    P.telegramBotToken = self.tokenInput.text.trim();
    P.chatID = self.chatIdInput.value;
    P.doStretch = self.autoStretchCheckbox.checked;
    P.linked = self.linkedCheckbox.checked;
    P.message = self.messageInput.text.trim();

    // Store parameters in the instance
    Parameters.clear();
    for (var key in P) {
      if (P[key] !== undefined) {
        Parameters.set(key, P[key]);
      }
    }
    self.newInstance();
  };

  // === "Documentation Browser" Button (Docm Icon) ===

   this.browseDocumentationButton = new ToolButton(this);
   this.browseDocumentationButton.icon = this.scaledResource(":/process-interface/browse-documentation.png");
   this.browseDocumentationButton.setScaledFixedSize(24, 24);
   this.browseDocumentationButton.toolTip =
            "<p>Opens a browser to view the script's documentation.</p>";
   this.browseDocumentationButton.onClick = function () {
            Dialog.browseScriptDocumentation("SendImageToTelegram");
    }


  // Run Button
  this.runButton = new PushButton(this);
  this.runButton.text = 'Run';
  this.runButton.icon = this.scaledResource(':/icons/power.png');

  this.runButton.onClick = () => {
    var token = this.tokenInput.text.trim();
    var chatID = this.chatIdInput.value;
    var doStretch = this.autoStretchCheckbox.checked;
    var linked = this.linkedCheckbox.checked;
    var message = this.messageInput.text.trim();
    if (!validateInputs(token, chatID)) {
      return; // Exit if validation fails
    }

    // Execute the image processing and sending function
    if (!ImageWindow.activeWindow.isNull) {
      processAndSendImageToTelegram(
        ImageWindow.activeWindow,
        token,
        chatID,
        doStretch,
        linked,
        message
      );
      saveTelegramSettings(token, chatID, doStretch, linked, message); // Save settings
      this.ok(); // Close the log
    } else {
      raiseError('No active image window found');
    }
  };

  // Cancel Button
  this.cancelButton = new PushButton(this);
  this.cancelButton.text = 'Cancel';
  this.cancelButton.icon = this.scaledResource(':/icons/close.png');
  this.cancelButton.onClick = function () {
    this.dialog.cancel();
  };

  // Reset Button
  this.resetButton = new ToolButton(this);
  this.resetButton.icon = this.scaledResource(':/process-interface/reset.png');
  this.resetButton.setScaledFixedSize(24, 24);
  this.resetButton.toolTip = '<p>Resets all settings to their defaults.</p>';
  this.resetButton.onClick = () => {
    resetTelegramSettings();
    this.tokenInput.text = '';
    this.chatIdInput.setValue(Number.NaN);
    this.autoStretchCheckbox.checked = false;
    this.linkedCheckbox.checked = false;
    this.messageInput.text = '';
  };

  // Button Layout
  var buttonSizer = new HorizontalSizer();
  buttonSizer.spacing = 8;
  buttonSizer.add(this.newInstanceButton);
  buttonSizer.add(this.browseDocumentationButton);
  buttonSizer.addStretch();
  buttonSizer.add(this.runButton);
  buttonSizer.add(this.cancelButton);
  buttonSizer.add(this.resetButton);

  // Main Layout
  this.sizer = new VerticalSizer();
  this.sizer.margin = 10;
  this.sizer.spacing = 6;
  this.sizer.add(tokenSizer);
  this.sizer.add(chatIdSizer);
  this.sizer.add(messageSizer);
  this.sizer.add(autoStretchSizer);
  this.sizer.add(linkedSizer);
  this.sizer.addSpacing(8);
  this.sizer.add(buttonSizer);

  this.adjustToContents();
}

function main() {
  printTheSpaceKoalaBanner();

  // If the process was dragged onto an image, execute immediately without opening the GUI
  if (Parameters.isViewTarget) {
    let targetWindow = Parameters.targetView.window;

    if (!targetWindow.isNull) {
      var token = Parameters.get('telegramBotToken');
      var chatID = Parameters.get('chatID');
      var doStretch = Parameters.get('doStretch');
      var linked = Parameters.get('linked');
      var message = Parameters.get('message');

      if (!validateInputs(token, chatID)) {
        return; // Exit if validation fails
      }

      processAndSendImageToTelegram(
        targetWindow,
        token,
        chatID,
        doStretch,
        linked,
        message
      );
    } else {
      printError('No valid target image found.');
    }
    return;
  }

  // Otherwise: Open the GUI
  let dialog = new TelegramDialog();
  if (!dialog.execute()) {
    printInfo('User canceled the script.');
    return;
  }
}

// Extend Dialog prototype
TelegramDialog.prototype = new Dialog();

main();

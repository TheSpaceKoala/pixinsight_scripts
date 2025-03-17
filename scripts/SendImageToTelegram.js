// ==================================================================================
// SendImageToTelegram.js - A PixInsight script to process an image and send it to Telegram
// ==================================================================================

#feature-id    SendImageToTelegram
#feature-info  This script processes the active image and sends it to a Telegram chat.
#feature-icon  @script_icons_dir/FastBatchPreprocessing.svg
#include       <pjsr/StdButton.jsh>
#include       <pjsr/StdIcon.jsh>
#include       <pjsr/StdCursor.jsh>
#include       <pjsr/Sizer.jsh>
#include       <pjsr/FrameStyle.jsh>
#include       <pjsr/NumericControl.jsh>
#include       <pjsr/DataType.jsh>
#include       <pjsr/SampleType.jsh>
#include       <pjsr/UndoFlag.jsh>
this.TELEGRAM_SETTINGS_KEY_BASE = 'SendImageToTelegram/';

function main() {
  console.noteln('[INFO] Send Image to Telegram - Script started.');

  // If the process was dragged onto an image, execute immediately without opening the GUI
  if (Parameters.isViewTarget) {
    let targetWindow = Parameters.targetView.window;

    if (!targetWindow.isNull) {
      console.noteln('[INFO] Running directly on dragged image.');
      let savedConfig = loadTelegramSettings();
      processAndSendImageToTelegram(
        targetWindow,
        savedConfig.telegramBotToken,
        savedConfig.chatID
      );
    } else {
      console.criticalln('[ERROR] No valid target image found.');
    }
    return;
  }

  // Otherwise: Open the GUI
  let dialog = new TelegramDialog();
  if (!dialog.execute()) {
    console.warningln('[WARNING] User canceled the script.');
    return;
  }
}

function loadTelegramSettings() {
  var telegramBotToken = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken',
    DataType_UCString
  );
  var chatID = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'chatID',
    DataType_Int32
  );
  var doStretch = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'doStretch',
    DataType_Boolean
  );
  var linked = Settings.read(
    TELEGRAM_SETTINGS_KEY_BASE + 'linked',
    DataType_Boolean
  );
  return { telegramBotToken: telegramBotToken, chatID: chatID, doStretch: doStretch, linked:linked };
}

function resetTelegramSettings() {
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken');
  Settings.remove(TELEGRAM_SETTINGS_KEY_BASE + 'chatID');
  console.noteln('[DEBUG] Telegram settings reset.');
}

function saveTelegramSettings(telegramBotToken, chatID, doStretch, linked) {
  Settings.write(
    TELEGRAM_SETTINGS_KEY_BASE + 'telegramBotToken',
    DataType_UCString,
    telegramBotToken
  );
  Settings.write(TELEGRAM_SETTINGS_KEY_BASE + 'chatID', DataType_Int32, chatID);
  Settings.write(TELEGRAM_SETTINGS_KEY_BASE + 'doStretch', DataType_Boolean, doStretch);
  Settings.write(TELEGRAM_SETTINGS_KEY_BASE + 'linked', DataType_Boolean, linked);
  console.noteln('[DEBUG] Telegram settings saved.');
}

function processAndSendImageToTelegram(imageWindow, telegramToken, chatId, doStretch, linked) {
  if (imageWindow.isNull) {
    console.criticalln('[ERROR] No active image window found.');
    return;
  }

  // Duplicate the image window
  var duplicateWindow = new ImageWindow(
    1,
    1,
    1,
    imageWindow.mainView.image.bitsPerSample,
    imageWindow.mainView.image.sampleType == SampleType_Real,
    false,
    'foobar23204'
  );
  with (duplicateWindow.mainView) {
    beginProcess(UndoFlag_NoSwapFile);
    image.assign(imageWindow.mainView.image);
    id = 'TelegramProcessed'; // Assign a temporary ID
    endProcess();
  }

  console.noteln('[DEBUG] Stretch image if option is selected');

   if (doStretch){
     let P = new PixelMath();
      if (linked) {
              P.expression =
       '//autostretch\n' +
       'c = min( max( 0, med( $T ) + C*1.4826*mdev( $T ) ), 1 );\n' +
       'mtf( mtf( B, med( $T ) - c ), max( 0, ($T - c)/~c ) )';
       }
      else {
     P.expression =
       '//autostretch\n' +
       'm = (med( $T[0] ) + med( $T[1] ) + med( $T[2] ))/3;\n' +
       'd = (mdev( $T[0] ) + mdev( $T[1] ) + mdev( $T[2] ))/3;\n' +
       'c = min( max( 0, m + C*1.4826*d ), 1 );\n' +
       'mtf( mtf( B, m - c ), max( 0, ($T - c)/~c ) )\n';
       }
     P.useSingleExpression = true;
     P.symbols = 'C = -2.8,\nB = 0.25,\nc,\nm,\nd';
     P.createNewImage = false;
     P.executeOn(duplicateWindow.mainView);

   }
  var width = duplicateWindow.mainView.image.width;
  var height = duplicateWindow.mainView.image.height;
  var resampleFactor = 1;

  // Loop until width + height is below 10,000
  while (width / resampleFactor + height / resampleFactor > 10000) {
    resampleFactor++;
  }
  if (resampleFactor > 1) {
    console.noteln(
      '[INFO] Image is too large. Applying ' +
        resampleFactor +
        'x downsampling...'
    );

    var P = new IntegerResample();
    P.zoomFactor = -2;
    P.downsamplingMode = IntegerResample.prototype.Average;
    P.noGUIMessages = true;
    P.executeOn(duplicateWindow.mainView);

    console.noteln(
      '[DEBUG] Resampling complete. New dimensions: ' +
        imageWindow.mainView.image.width +
        ' x ' +
        imageWindow.mainView.image.height
    );
  }

  // Export image as JPEG
  var jpegPath = File.systemTempDirectory + '/TelegramProcessed.jpg';
  duplicateWindow.saveAs(jpegPath, false, false, false, false, 'quality=80');
  console.noteln('[DEBUG] Image saved as JPEG: ' + jpegPath);

  // Send the image via Telegram
  sendPhotoToTelegram(jpegPath, telegramToken, chatId);
  // Close the duplicate window
  duplicateWindow.forceClose();
  console.noteln('[DEBUG] Duplicate image window closed.');
}

function sendPhotoToTelegram(imagePath, telegramToken, chatId) {
  console.noteln('[DEBUG] Sending image to Telegram: ' + imagePath);

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
    '-F',
    'caption=Your processed image',
  ];

  // Execute curl command
  let exitCode = ExternalProcess.execute('curl', args);

  // Check if the request was successful
  if (exitCode !== 0) {
    console.criticalln(
      '[ERROR] Failed to send photo. Curl exit code: ' + exitCode
    );
  } else {
    console.noteln('[INFO] Photo successfully sent to Telegram!');
  }
}

function TelegramDialog() {
  this.__base__ = Dialog;
  this.__base__();

  this.windowTitle = 'Send Image to Telegram';

  // Load saved settings
  let savedConfig = loadTelegramSettings();
  console.noteln('savedConfig ' + JSON.stringify(savedConfig));
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
  this.chatIdInput.setRange(0, 999999999999999999999999999999999999); // Set a reasonable range
  this.chatIdInput.setPrecision(0); // No decimals
  this.chatIdInput.setValue(savedConfig.chatID || 0); // Default to 0 if empty
  this.chatIdInput.setFixedWidth(350);

  let chatIdSizer = new HorizontalSizer();
  chatIdSizer.spacing = 4;
  chatIdSizer.add(this.chatIdLabel);
  chatIdSizer.add(this.chatIdInput, 100);

    // === Auto-Stretch Checkbox ===
    this.autoStretchCheckbox = new CheckBox(this);
    this.autoStretchCheckbox.text = "Auto-Stretch";
    this.autoStretchCheckbox.checked = savedConfig.doStretch || false;

    var autoStretchSizer = new HorizontalSizer;
    autoStretchSizer.spacing = 4;
    autoStretchSizer.addSpacing(20);
    autoStretchSizer.add(this.autoStretchCheckbox);
    autoStretchSizer.addStretch();

    // === Linked Checkbox (Only Active When Auto-Stretch is Enabled) ===
    this.linkedCheckbox = new CheckBox(this);
    this.linkedCheckbox.text = "Linked Channels";
    this.linkedCheckbox.checked = savedConfig.linked || false;
    this.linkedCheckbox.enabled = this.autoStretchCheckbox.checked; // Initially enabled based on auto-stretch

    var linkedSizer = new HorizontalSizer;
    linkedSizer.spacing = 4;
    linkedSizer.addSpacing(20);
    linkedSizer.add(this.linkedCheckbox);
    linkedSizer.addStretch();

   // === Toggle Linked Checkbox Based on Auto-Stretch ===
    var self = this;
    this.autoStretchCheckbox.onCheck = function(checked) {
        self.linkedCheckbox.enabled = checked;
    };

  // === "New Instance" Button (Triangle Icon) ===
  this.newInstanceButton = new ToolButton(this);
  this.newInstanceButton.icon = this.scaledResource(
    ':/process-interface/new-instance.png'
  );
  this.newInstanceButton.setScaledFixedSize(24, 24);
  this.newInstanceButton.toolTip = 'New Instance';
  this.newInstanceButton.onMousePress = () => {
    // stores the parameters
    saveTelegramSettings(self.tokenInput.text.trim(), self.chatIdInput.value); // Save settings
    // create the script instance
    this.newInstance();
  };

  // Run Button
  this.runButton = new PushButton(this);
  this.runButton.text = 'Run';
  this.runButton.icon = this.scaledResource(':/icons/power.png');
  var self = this; // Store reference to the dialog

  this.runButton.onClick = function () {
    var token = self.tokenInput.text.trim() || '';
    var chatID = self.chatIdInput.value || 0;
    var doStretch = self.autoStretchCheckbox.checked;
    var linked = self.linkedCheckbox.checked;

    if (token === '' || chatID === 0) {
      console.criticalln(
        '[ERROR] Telegram Token and Chat ID must be provided!'
      );
      return;
    }

    saveTelegramSettings(token, chatID, doStretch, linked); // Save settings

    console.noteln(
      '[INFO] Telegram settings saved: Token Length ' +
        token.length +
        ', Chat ID ' +
        chatID
    );

    // Execute the image processing and sending function
    if (!ImageWindow.activeWindow.isNull) {
      processAndSendImageToTelegram(ImageWindow.activeWindow, token, chatID, doStretch, linked);
      console.noteln('[INFO] Image sent to Telegram.');
    } else {
      console.criticalln('[ERROR] No active image window found.');
    }

    self.ok(); // Close the dialog
  };

  // Cancel Button
  this.cancelButton = new PushButton(this);
  this.cancelButton.text = 'Cancel';
  this.cancelButton.icon = this.scaledResource(':/icons/close.png');
  this.cancelButton.onClick = function () {
    this.dialog.cancel();
  };

  // Button Layout
  var buttonSizer = new HorizontalSizer();
  buttonSizer.spacing = 8;
  buttonSizer.add(this.newInstanceButton);
  buttonSizer.addStretch();
  buttonSizer.add(this.runButton);
  buttonSizer.add(this.cancelButton);

  // Main Layout
  this.sizer = new VerticalSizer();
  this.sizer.margin = 10;
  this.sizer.spacing = 6;
  this.sizer.add(tokenSizer);
  this.sizer.add(chatIdSizer);
  this.sizer.add(autoStretchSizer);
  this.sizer.add(linkedSizer);
  this.sizer.addSpacing(8);
  this.sizer.add(buttonSizer);

  this.adjustToContents();
}

// Extend Dialog prototype
TelegramDialog.prototype = new Dialog();

main();

#include <pjsr/SampleType.jsh>
#include <pjsr/UndoFlag.jsh>


  // ==================================================================================
  // KoalaUtils.js - Common utilities for The Space Koala scripts
  // ==================================================================================


  function printTheSpaceKoalaBanner() {
    console.writeln('  _____ _           ');
    console.writeln(' |_   _| |__   ___          ');
    console.writeln('   | | |  _ \\ / _ \\           ');
    console.writeln('   | | | | | |  __/  ');
    console.writeln('  _|_| |_| |_|\\___|          _  __           _       ');
    console.writeln(' / ___| _ __   __ _  ___ ___| |/ /___   __ _| | __ _ ');
    console.writeln(
      ' \\___\\ |  _ \\ / _` |/ __/ _ \\ | // _ \\ / _` | |/ _` |'
    );
    console.writeln('  ___) | |_) | (_| | (_|  __/ . \\ (_) | (_| | | (_| |');
    console.writeln(
      ' |____/| .__/ \\__,_|____\\___|_|\\_\\___/ \\__,_|_|\\__,_|'
    );
    console.writeln('       |_|         ');
  }

  function printDebug(msg) {
    console.noteln('[DEBUG] ' + msg);
  }

  function printInfo(msg) {
    console.writeln('[INFO] ' + msg);
  }

  function printError(msg) {
    console.criticalln('[ERROR] ' + msg);
  }

  function raiseError(errorMessage) {
    new MessageBox(
      errorMessage,
      'ERROR',
      StdIcon_Error,
      StdButton_Ok
    ).execute();
  }

  function raiseInfo(infoMessage) {
    new MessageBox(
      infoMessage,
      'INFO',
      StdIcon_Information,
      StdButton_Ok
    ).execute();
  }

  function raiseWarning(warningMessage) {
    new MessageBox(
      warningMessage,
      'WARNING',
      StdIcon_Warning,
      StdButton_Ok
    ).execute();
  }

  /**
   * Duplicates an image window and propagates the mainView from the input ImageWindow
   * @param {ImageWindow} imageWindow - The source image window to duplicate.
   * @param {string} newId - The ID for the duplicated window.
   * @returns {ImageWindow} - The new duplicated image window.
   */
  function duplicateImageWindow(imageWindow, newId) {
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

    with (duplicateWindow.mainView) {
      beginProcess(UndoFlag_NoSwapFile);
      image.assign(imageWindow.mainView.image);
      id = newId;
      endProcess();
    }

    printInfo('Image duplicated successfully with ID: ' + newId);
    return duplicateWindow;
  }

  // Apply an automatic stretch to a given view
  function applyAutoStretch(view, linked) {
    if (!view || view.isNull) {
      printError('Invalid view provided for auto-stretching.');
      return;
    }

    printInfo('Applying auto-stretch. Linked: ' + linked);

    let P = new PixelMath();
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

    printInfo('Auto-stretch applied successfully.');
  }

  /**
   * Downsamples an image view by a given factor.
   * @param {View} view - The image view to process.
   * @param {number} factor - The zoom factor (e.g., -2 for 2x downsampling).
   */

  function downsampleImage(view, factor) {
    if (!view || view.isNull) {
      printError('Invalid view provided for downsampling.');
      return;
    }

    printInfo('Applying downsampling. Factor: ' + factor);

    var P = new IntegerResample();
    P.zoomFactor = factor;
    P.downsamplingMode = IntegerResample.prototype.Average;
    P.noGUIMessages = true;
    P.executeOn(view);

    printInfo(
      'Resampling complete. New dimensions: ' +
        view.image.width +
        ' x ' +
        view.image.height
    );
  }

  /**
   * Saves an image window as a JPEG in the specified directory.
   * @param {ImageWindow} imageWindow - The image window to save.
   * @param {string|null} directory - The target directory (or null for system temp directory).
   * @param {string} filename - The desired output filename.
   * @returns {string|null} - The full path of the saved JPEG file, or null if failed.
   */
  function saveImageAsJpeg(imageWindow, directory, filename) {
    if (!imageWindow || imageWindow.isNull) {
      printError('Invalid image window provided for JPEG export.');
      return null;
    }

    // Use temp directory if directory is null
    var outputDirectory = directory ? directory : File.systemTempDirectory;

    // Ensure filename does not end with .jpg or .jpeg (case-insensitive)
    var sanitizedFilename = filename.replace(/\.(jpg|jpeg)$/i, '') + '.jpg';

    // Construct full file path
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

    printInfo('JPEG saved successfully at: ' + jpegPath);
    return jpegPath;
  }
//})();

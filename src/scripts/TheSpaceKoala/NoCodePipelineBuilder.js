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
// No Code Pipeline Builder
// Version: V1.0.11 - 20260801
// Author: Luca Bartek, Roberto Sartori
// Website: www.thespacekoala.com
// Target runtime: PixInsight PJSR 2.0 (V8).
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
// 1. Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
// 2. NonCommercial — You may not use the material for commercial purposes.
//
// @license CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/)
//
// COPYRIGHT © 2025 Luca Bartek, Roberto Sartori. ALL RIGHTS RESERVED.
////////////////////////////////////////////////////////////////////////////

///////////////////////////////////
//      PIPELINE BUILDER SCRIPT
///////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////
// MAPPING OF ALL AVAILABLE ENTRY POINTS FOR THE NO CODE PIPELINE BUILDER
///////////////////////////////////////////////////////////////////////////////////

// Define available master file types
var WBPPMasterTypes = ['MASTER_LIGHT', 'DRIZZLE', 'RECOMBINED'];

// Define available master file variants
var WBPPMasterVariants = ['REGULAR', 'CROPPED'];

var customStep = {
  onCalibrationStart: 1,
  onCalibrationEnd: 2,
  onLPSStart: 3,
  onLSPEnd: 4,
  onCCStart: 5,
  onCCEnd: 6,
  onDebayerStart: 7,
  onDebayerEnd: 8,
  onPreProcessEnd: 9,
  onPostProcessStart: 10,
  onFrameSelectionStart: 11,
  onFrameSelectionEnd: 12,
  onRegistrationStart: 13,
  onRegistrationEnd: 14,
  onLNStart: 15,
  onLNEnd: 16,
  onIntegrationStart: 17,
  onIntegrationEnd: 18,
  onPostProcessEnd: 19,
};

var WBPPProcessedMasterGroups = {};

///////////////////////////////////////////////////////////////////////////////////
// PATCH WBPP TARGET FRAME GENERATION TO PRESERVE EXISTING DRIZZLE SIDE CARS
///////////////////////////////////////////////////////////////////////////////////

if (
  typeof WBPPUtils != 'undefined' &&
  typeof WBPPUtils.enableTargetFrames == 'function' &&
  !WBPPUtils.__tskEnableTargetFramesPatched__
) {
  WBPPUtils.__tskEnableTargetFramesPatched__ = true;
  WBPPUtils.__tskOriginalEnableTargetFrames__ = WBPPUtils.enableTargetFrames;

  WBPPUtils.enableTargetFrames = function (
    array,
    nColumns,
    enableDrizzle,
    enableLN
  ) {
    // PixInsight 1.9.x process tables require at least four values per row.
    // Keep empty drizzle and local-normalization columns when they are unused.
    var actualColumns = Math.max(nColumns, 4);
    var target = new Array();
    for (var i = 0; i < array.length; ++i) {
      target[i] = new Array(actualColumns);
      for (var j = 0; j < nColumns - 1; ++j) target[i][j] = true;

      var filePath;
      if (typeof array[i] == 'string') {
        filePath = array[i];
      } else {
        filePath = array[i].current;
      }

      target[i][nColumns - 1] = filePath;

      if (enableDrizzle) {
        target[i][nColumns] =
          typeof array[i] != 'string' &&
          array[i].drizzleFile != undefined &&
          array[i].drizzleFile.length > 0
            ? array[i].drizzleFile
            : File.changeExtension(filePath, '.xdrz');
      } else if (actualColumns > nColumns) {
        target[i][nColumns] = '';
      }

      if (enableLN) {
        target[i][nColumns + 1] =
          typeof array[i] != 'string' &&
          array[i].localNormalizationFile != undefined &&
          array[i].localNormalizationFile.length > 0
            ? array[i].localNormalizationFile
            : File.changeExtension(filePath, '.xnml');
      } else if (actualColumns > nColumns + 1) {
        target[i][nColumns + 1] = '';
      }

      for (var j = nColumns + 2; j < actualColumns; ++j)
        target[i][j] = '';
    }
    return target;
  };
}

///////////////////////////////////////////////////////////////////////////////////
// RETURNS THE NAME OF A CUSTOM STEP - USED FOR NAMING IN THE PIPELINE
///////////////////////////////////////////////////////////////////////////////////
StackEngine.prototype.customStepName = function (customStepId) {
  for (var key in customStep) {
    if (customStep[key] === customStepId) {
      return key; // Return the key name if the value matches
    }
  }
  return null; // Return null if not found
};

///////////////////////////////////////////////////////////////////////////////////
// CALCULATES THE FACTOR TO CALCULATE THE SPACE REQUIRED FOR A PROCESS
///////////////////////////////////////////////////////////////////////////////////
StackEngine.prototype.processSizeFactor = function (pixiProcess) {
  if (pixiProcess.processId() == 'IntegerResample') {
    return 1 / pixiProcess.zoomFactor / pixiProcess.zoomFactor;
  } else {
    return 1;
  }
};

StackEngine.prototype.groupsMissingRegistrationReferences = function (groups) {
  var missing = [];

  for (var i = 0; i < groups.length; ++i) {
    if (groups[i] != undefined && groups[i].__reference_frame__ == undefined) {
      missing.push(groups[i]);
    }
  }

  return missing;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXTRACTS PROCESSES FROM THE WBPP CONTAINER, APPLIES INHERITANCE RULES
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

StackEngine.prototype.extractProcessesFromWBPP = function (currentStep) {
  var wbppContainer = ProcessInstance.fromIcon('WBPP');
  if (!wbppContainer) {
    if (
      typeof WBPPUtils == 'undefined' ||
      !WBPPUtils.__tskMissingProcessContainerNoticeShown__
    ) {
      console.noteln(
        "No process container icon named 'WBPP' was found. Custom no-code pipeline steps will be skipped."
      );
      if (typeof WBPPUtils != 'undefined')
        WBPPUtils.__tskMissingProcessContainerNoticeShown__ = true;
    }
    return [];
  }

  if (typeof WBPPUtils != 'undefined')
    WBPPUtils.__tskMissingProcessContainerNoticeShown__ = false;

  function shallowCopy(obj) {
    var copy = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = obj[key]; // Copy each key-value pair
      }
    }
    return copy;
  }

  function extractProcesses(
    pixiProcess,
    inheritedAttributes,
    processList,
    currentStep
  ) {
    // Inherit attributes from parent
    var attributes = shallowCopy(inheritedAttributes);

    //extract values and concatenate to inherited ones (if any)
    if (pixiProcess.description) {
      // Split description using spaces, underscores, commas, or semicolons
      var parts = pixiProcess.description().split(/[\s_,;]+/);

      for (var i = 0; i < parts.length; i++) {
        var pair = parts[i].split(/[=-]+/); // Split by "=", "-"

        if (pair.length === 2) {
          var key = pair[0].toLowerCase();
          var value = pair[1];

          attributes[key] = value; // Overwrite if key already exists
        }
      }
    }

    //then if it's a process container call the function again on each child
    if (pixiProcess.processId() == 'ProcessContainer') {
      for (var i = 0; i < pixiProcess.length; i++) {
        var child = pixiProcess[i];
        extractProcesses(child, attributes, processList, currentStep);
      }
    }
    //otherwise add current process to the list of processes returned by the function
    else {
      // Ensure the process has a step and it is the one currently evaluated
      if (
        !attributes.step ||
        !customStep.hasOwnProperty(attributes.step) ||
        customStep[attributes.step] !== currentStep
      ) {
        return; //don't add it if step is missing
      }
      processList.push({
        process: pixiProcess, // Store process instance
        attributes: attributes,
      });
    }
  }

  var processes = [];
  extractProcesses(wbppContainer, {}, processes, currentStep);

  return processes;
};

///////////////////////////////////////////////////////////////////////////////////
// CUSTOM OPERATION - DYNAMICALLY ADDS A PROCESSING STEP TO A GROUP AND EXECUTES IT
///////////////////////////////////////////////////////////////////////////////////
StackEngine.prototype.CustomOperation = class extends BPPOperationBlock {
  constructor(
    frameGroup,
    pixiProcess,
    currentStep,
    customStepSeqNr,
    spaceRequiredFactor,
    isMasterStep,
    frameGroupIndex
  ) {
    var processName = '';
    if (pixiProcess.processId() == 'NoOperation') {
      processName = 'Custom ' + engine.customStepName(currentStep) + ' step(s)';
    } else {
      processName =
        '  ' +
        engine.customStepName(currentStep) +
        ' #' +
        customStepSeqNr +
        ': ' +
        pixiProcess.processId();
    }

    super(processName, frameGroup, true /* trackable */);

    /*
     * Compute the required disk space for execution.
     * We estimate based on frame count and frame size.
     */
    this.spaceRequired = () => {
      if (!isMasterStep) {
        return (
          frameGroup.fileItems.length *
          frameGroup.frameSize() *
          spaceRequiredFactor
        );
      } else {
        return 1 * frameGroup.frameSize() * spaceRequiredFactor; // TODO: Replace 1 with actual master frame count
      }
    };

    /**
     * Defines standard group data for logging and debugging.
     **/
    this.envForScript = () => ({
      name: processName,
      status: this.status,
      statusMessage: this.statusMessage,
      group: frameGroup,
    });

    this._run = () => {
    // If this is a master step, clear existing active frames and retrieve master files
    if (isMasterStep) {

      while (frameGroup.fileItems.length > 0) {
        frameGroup.removeItem(0);
      }

      var masterFiles = [];
      // Loop through all master type and variant combinations
      for (var type of WBPPMasterTypes) {
        for (var variant of WBPPMasterVariants) {
          var masterKey = type + '_' + variant;

          // Retrieve the processed master file first, otherwise fallback to the original master file
          var masterFile;
          if (WBPPProcessedMasterGroups.hasOwnProperty(frameGroupIndex)) {
            masterFile = WBPPProcessedMasterGroups[frameGroupIndex][masterKey];
          } else {
            masterFile = frameGroup.getMasterFileName(
              BPP.MasterType[type],
              BPP.MasterVariant[variant]
            );
          }

          if (masterFile) {
            masterFiles.push(masterFile);
          }
        }
      }

      // If no master files are found, terminate the function
      if (masterFiles.length === 0) {
        console.warning('[WARNING] No master files found! Exiting function.');
        return OperationBlockStatus.FAILED;
      }

      // Convert master files into `FileItem` instances and add them to `frameGroup.fileItems`
      for (var masterFile of masterFiles) {
        var fileItem = new FileItem(masterFile);
        frameGroup.fileItems.push(fileItem);
      }
    }

    // Retrieve the active frames after modifications
    var activeFrames = frameGroup.activeFrames();

    // If no active frames exist, terminate the function
    if (activeFrames.length == 0) return OperationBlockStatus.DONE;

    // Set the output directory, removing frameGroup.folderName() for master files
    var outputFolder = WBPPUtils.existingDirectory(
      engine.outputDirectory +
        '/' +
        engine.customStepName(currentStep) +
        (isMasterStep ? '' : '/' + frameGroup.folderName())
    );

    // Define the custom process instance
    var P = pixiProcess;

    // Track the number of successfully processed frames
    var nSuccess = 0;
    var nFailed = 0;

    // Loop through all active frames and process them
    for (var i = 0; i < activeFrames.length; i++) {
      var filePath = activeFrames[i].current;

      // Open the image file
      var w = ImageWindow.open(filePath);
      if (w.length == 0) {
        // Mark frame as failed if unable to load
        activeFrames[i].processingFailed();
        nFailed++;
        continue;
      }

      // Close all additional windows except the first
      for (var k = 1; k < w.length; k++) w[k].forceClose();

      // Execute the custom process
      var view = w[0].mainView;
      var outputFile =
        outputFolder + '/' + File.extractNameAndExtension(filePath);

      if (P.executeOn(view)) {
        // Save the processed image
        w[0].saveAs(outputFile, false, false, false, false);
      }

      // If output file exists, mark processing as successful
      if (File.exists(outputFile)) {
        activeFrames[i].processingSucceeded(
          Number(currentStep * 1000000) + Number(customStepSeqNr * 1000),
          outputFile
        );
        nSuccess++;

        // Only master steps need to track outputs for subsequent custom
        // operations. Ordinary frame steps must not query master-file state.
        if (isMasterStep) {
          for (var type of WBPPMasterTypes) {
            for (var variant of WBPPMasterVariants) {
              var masterKey = type + '_' + variant;
              var existingMasterFile = frameGroup.getMasterFileName(
                BPP.MasterType[type],
                BPP.MasterVariant[variant]
              );

              if (
                existingMasterFile &&
                File.extractName(existingMasterFile) ===
                  File.extractName(outputFile)
              ) {
                if (!WBPPProcessedMasterGroups.hasOwnProperty(frameGroupIndex)) {
                  WBPPProcessedMasterGroups[frameGroupIndex] = {};
                }
                WBPPProcessedMasterGroups[frameGroupIndex][masterKey] =
                  outputFile;
                break;
              }
            }
          }
        }
      } else {
        // If writing failed, mark frame as failed
        activeFrames[i].processingFailed();
        nFailed++;
      }
      w[0].forceClose();
    }

    // Save the step status information
    this.statusMessage = WBPPUtils.resultCountToString(0, nSuccess, nFailed, 'processed');
    this.hasWarnings = nFailed > 0;
    return OperationBlockStatus.DONE;
  };
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FILTER PREVIOUSLY RETRIEVED PROCESS LIST FOR EACH OF THE FRAME GROUPS AND CALL THE SCHEDULER TO ADD THE STEP TO THE PIPELINE AND EXECUTE THE PROCESS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

StackEngine.prototype.getAndScheduleProcesses = function (
  groups,
  currentStep,
  isMasterStep
) {
  var imageTypeMapping = {
    light: ImageType.Light,
    dark: ImageType.Dark,
    bias: ImageType.Bias,
    flat: ImageType.Flat,
  };

  var processesForCurrentStep = engine.extractProcessesFromWBPP(currentStep);
  // loop on full list of processes applicable to current step
  // filter them and apply only on applicable groups
  // schedule those processes for the groups
  for (var j = 0; j < groups.length; ++j) {
    var processListToApply = [];
    for (var i = 0; i < processesForCurrentStep.length; ++i) {
      var processToAdd = true;

      if (
        groups[j].associatedRGBchannel != BPP.AssociatedChannel.COMBINED_RGB &&
        groups[j].imageType == ImageType.Light
      ) {
        for (var key in processesForCurrentStep[i].attributes) {
          if (key === 'step') {
            continue;
          }
          //eventually if we re-add support for filtering on image type
          /*   else if (key === 'imagetype') {
            // check for type of group if light/bias/dark/flat
            if (
              groups[j].imageType !=
              imageTypeMapping[
                processesForCurrentStep[i].attributes[key].toLowerCase()
              ]
            ) {
              processToAdd = false;
              break;
            }
          }
          */
          else {
            // for any other keyword we assume those are grouping keywords and we look for matches
            for (var groupkeyword in groups[j].keywords) {
            if (groupkeyword.toLowerCase() != key.toLowerCase()) {
                continue;
              } else if (
                groups[j].keywords[groupkeyword] !=
                processesForCurrentStep[i].attributes[key]
              ) {
                processToAdd = false;
                break;
              }
            }
          }
        }

        // we need to add this process to the list of custom operations
        if (processToAdd) {
          processListToApply.push(processesForCurrentStep[i].process);
        }
      }
    }
    if (processListToApply.length > 0) {
      var noOpProc = new NoOperation();
      processListToApply.unshift(noOpProc);
    }

    var spaceRequiredFactor = 1;
    // loop through all processes for the group to get the overall size multiplying factor
    for (var p = 0; p < processListToApply.length; ++p) {
      spaceRequiredFactor *= engine.processSizeFactor(processListToApply[p]);
    }
    for (var p = 0; p < processListToApply.length; ++p) {
      //this is the first custom operation, we initialize the size counter for it
      if (!engine.WS.customOperation) {
        engine.WS.customOperation = {
          label: 'Custom Operations',
          size: 0,
        };
      }
      //we pass the "space required factor" - to be enhanced later in case we want to add
      //specific factors for specific processes for a more accurate calculation
      if (p > 0) {
        spaceRequiredFactor = 0;
      }
      // instantiate the operation, update the operation size counter and schedule the operation
      var customOperation = new engine.CustomOperation(
        groups[j],
        processListToApply[p],
        currentStep,
        p,
        spaceRequiredFactor,
        isMasterStep,
        j
      );
      engine.WS.customOperation.size += customOperation.spaceRequired();
      engine.operationQueue.addOperation(customOperation);
    }
  }
};

//////////////////////////////////
//  PIPELINE BUILDER INSTRUCTIONS
///////////////////////////////////

var build = () => {

  // pre-process groups first
  var groupsPRE = engine.groupsManager.groupsForMode(BPP.GroupingMode.PRE);

  // CALIBRATION
  for (var i = 0; i < groupsPRE.length; ++i) {
    if (groupsPRE[i].imageType == ImageType.Light) {
      var logEnv = {
        processLogger: engine.processLogger,
        group: groupsPRE[i],
      };

      // log header
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.newLine();
        env.params.processLogger.addMessage(
          env.params.group.logStringHeader('LIGHT FRAMES CALIBRATION')
        );
      }, logEnv);

      // calibration step (only if calibration masters are found)
      var cg = engine.calibrationMatcher.getCalibrationGroupsFor(groupsPRE[i]);
      if (cg.masterBias || cg.masterDark || cg.masterFlat) {
        var calibrationOperation = new engine.calibrationOperation(
          groupsPRE[i]
        );
        engine.WS.calibrationLight.size += calibrationOperation.spaceRequired();
        engine.operationQueue.addOperation(calibrationOperation);
      }

      // log footer
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.addMessage(env.params.group.logStringFooter());
        env.params.processLogger.newLine();
      }, logEnv);
    }
  }

  var groupsToCalibrate = groupsPRE.slice();
  for (var j = groupsToCalibrate.length - 1; j >= 0; j--) {
    var cg = engine.calibrationMatcher.getCalibrationGroupsFor(groupsToCalibrate[j]);

    // Check if none of the conditions are true
    if (!(cg.masterBias || cg.masterDark || cg.masterFlat)) {
      // Remove the group from the list if the condition is met
      groupsToCalibrate.splice(j, 1);
    }
  }
  if (groupsToCalibrate.length > 0) {
    engine.getAndScheduleProcesses(
      groupsToCalibrate,
      customStep.onCalibrationEnd,
      false
    );
  }
  // LINEAR PATTERN SUBTRACTION
  if (engine.linearPatternSubtraction) {
    //   engine.getAndScheduleProcesses(groupsPRE, customStep.onLPSStart, false);

    var logEnv = {
      processLogger: engine.processLogger,
    };
    // log header
    engine.operationQueue.addOperationBlock(env => {
      env.params.processLogger.newLine();
      env.params.processLogger.addMessage(
        '<b>********************</b> <i>LINEAR DEFECTS CORRECTION</i> <b>********************</b>'
      );
    }, logEnv);

    var LPSOperation = new engine.LPSOperation();
    engine.WS.LPS.size += LPSOperation.spaceRequired();
    engine.operationQueue.addOperation(LPSOperation);

    // log footer
    engine.operationQueue.addOperationBlock(env => {
      env.params.processLogger.addMessage(
        '<b>' + BPP.Format.SEPARATOR + '</b>'
      );
      env.params.processLogger.newLine();
    }, logEnv);
    //   engine.getAndScheduleProcesses(groupsPRE, customStep.onLPSEnd, false);
  }
  // COSMETIC CORRECTON AND DEBAYER

  for (var i = 0; i < groupsPRE.length; ++i) {
    if (groupsPRE[i].imageType == ImageType.Light) {
      var logEnv = {
        processLogger: engine.processLogger,
        group: groupsPRE[i],
      };

      var needsCC =
        groupsPRE[i].ccData.CCTemplate &&
        groupsPRE[i].ccData.CCTemplate.length > 0;
      var needsDebayer = groupsPRE[i].isCFA;

      if (!needsCC && !needsDebayer) continue;

      // log header
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.newLine();
        env.params.processLogger.addMessage(
          env.params.group.logStringHeader(
            (needsCC ? 'COSMETIZATION' : '') +
              (needsCC && needsDebayer ? ' and ' : '') +
              (needsDebayer ? 'DEBAYERING' : '')
          )
        );
      }, logEnv);

      // cosmetic correction
      if (needsCC) {
        var cosmeticCorretcionOperation =
          new engine.CosmeticCorrectionOperation(groupsPRE[i]);
        engine.WS.cosmeticCorrection.size +=
          cosmeticCorretcionOperation.spaceRequired();
        engine.operationQueue.addOperation(cosmeticCorretcionOperation);
      }

      // debayer
      if (needsDebayer) {
        var debayerOperation = new engine.DebayerOperation(groupsPRE[i]);
        engine.WS.debayer.size += debayerOperation.spaceRequired();
        engine.operationQueue.addOperation(debayerOperation);
      }

      // log footer
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.addMessage(env.params.group.logStringFooter());
        env.params.processLogger.newLine();
      }, logEnv);
    }
  }
  // POST-PROCESS GROUPS
  var groupsPOST = engine.groupsManager
    .groupsForMode(BPP.GroupingMode.POST)
    .filter(g => g.isActive);
  var canReuseReferenceFrames = engine.reuseLastReferenceFrames;
  if (canReuseReferenceFrames) {
    if (engine.groupsMissingRegistrationReferences(groupsPOST).length > 0) {
      // Fall back to selecting references for this pipeline build without
      // changing the user's persistent WBPP preference.
      canReuseReferenceFrames = false;
    }
  }

  // MEASUREMENT OPERATION
  var generateSubframesWeights =
    engine.subframeWeightingEnabled &&
    (engine.subframesWeightsMethod == BPP.SubframeWeightsMethod.FORMULA ||
      engine.integrate);
  var frameSelectionEnabled =
    typeof engine.FrameSelectionOperation === 'function' &&
    typeof engine.frameSelectionEnabled != 'undefined' &&
    engine.frameSelectionEnabled;
  var measureForBestFrameSelection =
    (engine.imageRegistration || engine.fastMode) &&
    engine.bestFrameReferenceMethod != BPP.BestReferenceMethod.MANUAL &&
    !canReuseReferenceFrames;
  var measureForFrameSelection = frameSelectionEnabled;
  var measureImages =
    generateSubframesWeights ||
    measureForBestFrameSelection ||
    engine.localNormalization ||
    measureForFrameSelection;

  // Measurements can require referenceFrameData even when registration
  // references are reused. Preparing this data does not replace the reused
  // registration reference frames; it only initializes the shared operation
  // environment required by WBPP's MeasurementOperation.
  if (!canReuseReferenceFrames || measureImages)
    engine.operationQueue.addOperation(
      new engine.ReferenceFrameDataPreparationOperation()
    );

  if (!engine.groupsManager.isEmpty() && measureImages) {
    engine.operationQueue.addOperation(new engine.MeasurementOperation());
    if (
      engine.subframeWeightingEnabled &&
      engine.subframesWeightsMethod == BPP.SubframeWeightsMethod.FORMULA
    )
      engine.operationQueue.addOperation(
        new engine.CustomFormulaWeightsGenerationOperation()
      );
    if (frameSelectionEnabled) {
      if (groupsPOST.length > 0) {
        engine.getAndScheduleProcesses(
          groupsPOST,
          customStep.onFrameSelectionStart,
          false
        );
      }
      engine.operationQueue.addOperation(new engine.FrameSelectionOperation());
      if (groupsPOST.length > 0) {
        engine.getAndScheduleProcesses(
          groupsPOST,
          customStep.onFrameSelectionEnd,
          false
        );
      }
    }
    if (
      engine.subframesWeightsMethod != BPP.SubframeWeightsMethod.PSFScaleSNR &&
      engine.integrate &&
      engine.groupsManager.regularIntegrationGroupExists()
    )
      engine.operationQueue.addOperation(
        new engine.BadFramesRejectionOperation()
      );
  }

  // SET THE REFERENCE FRAME (for both post calibration group with or without fast integration )
  var regularRegistrationGroupExists =
    engine.imageRegistration &&
    engine.groupsManager.regularIntegrationGroupExists();
  if (
    !engine.groupsManager.isEmpty() &&
    (regularRegistrationGroupExists ||
      (engine.groupsManager.fastIntegrationGroupExists() && engine.integrate))
  )
    if (!canReuseReferenceFrames)
      engine.operationQueue.addOperation(
        new engine.ReferenceFrameSelectionOperation()
      );

  if (groupsPRE.length > 0) {
    engine.getAndScheduleProcesses(
      groupsPRE,
      customStep.onPreProcessEnd,
      false
    );
  }
  // exit if no registration, local normalization and integration needs to be performed
  if (
    !generateSubframesWeights &&
    !engine.imageRegistration &&
    !engine.localNormalization &&
    !engine.integrate
  )
    return;

  if (groupsPOST.length > 0) {
    engine.getAndScheduleProcesses(
      groupsPOST,
      customStep.onPostProcessStart,
      false
    );
  }

  // POST-PROCESS GROUPS - REGISTRATION
  if (engine.imageRegistration) {
    engine.getAndScheduleProcesses(
      groupsPOST,
      customStep.onRegistrationStart,
      false
    );
    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          BPP.AssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('IMAGE REGISTRATION')
          );
        }, logEnv);

        var registrationOperation = new engine.RegistrationOperation(
          groupsPOST[i]
        );
        engine.WS.registration.size += registrationOperation.spaceRequired();
        engine.operationQueue.addOperation(registrationOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }
    engine.getAndScheduleProcesses(
      groupsPOST,
      customStep.onRegistrationEnd,
      false
    );
  }

  // POST-PROCESS GROUPS - LOCAL NORMALIZATION REFERENCE FRAME SELECTION
  if (engine.localNormalization)
    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          BPP.AssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader(
              'LOCAL NORMALIZATION - REFERENCE FRAME SELECTION'
            )
          );
        }, logEnv);

        if (!engine.reuseLastLNReferenceFrames) {
          var lnReferenceFrameSelectionOperation =
            new engine.LocalNormalizationReferenceFrameSelectionOperation(
              groupsPOST[i]
            );
          engine.WS.localNormalization.size +=
            lnReferenceFrameSelectionOperation.spaceRequired();
          engine.operationQueue.addOperation(
            lnReferenceFrameSelectionOperation
          );
        }

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

  // POST-PROCESS GROUPS - LOCAL NORMALIZATION
  if (engine.localNormalization)
    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          BPP.AssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('LOCAL NORMALIZATION')
          );
        }, logEnv);

        var lnOperation = new engine.LocalNormalizationOperation(groupsPOST[i]);
        engine.WS.localNormalization.size += lnOperation.spaceRequired();
        engine.operationQueue.addOperation(lnOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

  // POST-PROCESS GROUPS - IMAGE INTGEGRATION

  if (engine.integrate) {
    // REGULAR INTEGRATION
    engine.getAndScheduleProcesses(
      groupsPOST,
      customStep.onIntegrationStart,
      false
    );

    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        BPP.AssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        !groupsPOST[i].fastIntegrationData.enabled
      ) {
        // Image Integration
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('IMAGE INTEGRATION')
          );
        }, logEnv);

        var imageIntegrationOperation = new engine.ImageIntegrationOperation(
          groupsPOST[i]
        );
        engine.WS.integration.size += imageIntegrationOperation.spaceRequired();
        engine.operationQueue.addOperation(imageIntegrationOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

    // FAST INTEGRATION

    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        BPP.AssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        groupsPOST[i].fastIntegrationData.enabled
      ) {
        // Fast Integration
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('FAST INTEGRATION')
          );
        }, logEnv);

        var fastIntegrationOperation = new engine.FastIntegrationOperation(
          groupsPOST[i]
        );
        engine.WS.fastIntegration.size +=
          fastIntegrationOperation.spaceRequired();
        var imageIntegrationOperation = new engine.ImageIntegrationOperation(
          groupsPOST[i]
        );
        engine.WS.integration.size += imageIntegrationOperation.spaceRequired();
        engine.operationQueue.addOperation(fastIntegrationOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

    // DRIZZLE INTEGRATION

    for (var i = 0; i < groupsPOST.length; ++i) {
      var standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        BPP.AssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        groupsPOST[i].isDrizzleEnabled()
      ) {
        // Fast Integration
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('DRIZZLE INTEGRATION')
          );
        }, logEnv);

        var drizzleIntegrationOperation =
          new engine.DrizzleIntegrationOperation(groupsPOST[i]);
        engine.WS.integration.size +=
          drizzleIntegrationOperation.spaceRequired();
        engine.operationQueue.addOperation(drizzleIntegrationOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

    // AUTO CROP

    if (engine.integrate && engine.autocrop && groupsPOST.length > 0) {
      var logEnv = {
        processLogger: engine.processLogger,
      };

      // log header
      engine.operationQueue.addOperationBlock(env => {
        console.writeln();
        env.params.processLogger.addMessage(
          '<b>*********************** <i>AUTO CROP</i> ***********************</b>'
        );
        console.writeln(BPP.Format.SEPARATOR);
        console.writeln('* Begin autocrop of master light frames');
        console.writeln(BPP.Format.SEPARATOR);
      }, logEnv);

      var autocropOperation = new engine.AutoCropOperation();
      engine.WS.integration.size += autocropOperation.spaceRequired();
      engine.operationQueue.addOperation(autocropOperation);

      // log footer
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.addMessage(
          '<b>' + BPP.Format.SEPARATOR + '</b>'
        );
        env.params.processLogger.newLine();
        console.writeln(BPP.Format.SEPARATOR);
        console.writeln('* End autocrop of master light frames');
        console.writeln(BPP.Format.SEPARATOR);
      }, logEnv);
    }

    // process the RGB recombination groups, this needs to be done at the end to ensure that all
    // gray R,G and B masters have been integrated
    for (var i = 0; i < groupsPOST.length; ++i) {
      var logEnv = {
        processLogger: engine.processLogger,
        group: groupsPOST[i],
      };

      // RGB RECOMBINATION
      if (
        groupsPOST[i].associatedRGBchannel == BPP.AssociatedChannel.COMBINED_RGB
      ) {
        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('RGB COMBINATION')
          );
        }, logEnv);

        // RGB Recombination
        var recombinationOperation = new engine.RGBRecombinationOperation(
          groupsPOST[i]
        );
        engine.WS.recombination.size += recombinationOperation.spaceRequired();
        engine.operationQueue.addOperation(recombinationOperation);

        // log footer
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter()
          );
          env.params.processLogger.newLine();
        }, logEnv);
      }
    }

    // Plate solve
    if (engine.integrate && engine.platesolve) {
      for (var i = 0; i < groupsPOST.length; ++i) {
        // Image Integration
        var logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('ASTROMETRIC SOLUTION')
          );
        }, logEnv);

        var plateSolveOperation = new engine.PlateSolveOperation(groupsPOST[i]);
        engine.operationQueue.addOperation(plateSolveOperation);

        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringFooter('COMPLETED')
          );
        }, logEnv);
      }
    }

    //Very last step on the final integrated file(s)
    if (engine.integrate) {
      engine.getAndScheduleProcesses(
        groupsPOST,
        customStep.onPostProcessEnd,
        true
      );
    }
  }
};

build();

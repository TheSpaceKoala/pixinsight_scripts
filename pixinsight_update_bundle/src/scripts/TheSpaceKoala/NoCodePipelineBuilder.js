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
// Version: V1.0.4 - 20250514
// Author: Luca Bartek, Roberto Sartori
// Website: www.thespacekoala.com
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
  onRegistrationStart: 11,
  onRegistrationEnd: 12,
  onLNStart: 13,
  onLNEnd: 14,
  onIntegrationStart: 15,
  onIntegrationEnd: 16,
  onPostProcessEnd: 17,
};

var WBPPProcessedMasterGroups = {};

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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXTRACTS PROCESSES FROM THE WBPP CONTAINER, APPLIES INHERITANCE RULES
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

StackEngine.prototype.extractProcessesFromWBPP = function (currentStep) {
  let wbppContainer = ProcessInstance.fromIcon('WBPP');
  if (!wbppContainer) {
    console.warning(
      'Error: WBPP process container not found. Aborting pipeline setup.'
    );
    return [];
  }

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
      let parts = pixiProcess.description().split(/[\s_,;]+/);

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
      for (let i = 0; i < pixiProcess.length; i++) {
        let child = pixiProcess.at(i);
        extractProcesses(child, attributes, processList, currentStep);
      }
    }
    //otherwise add current process to the list of processes returned by the function
    else {
      // Ensure the process has a step and it is the one currently evaluated
      if (!attributes.step || customStep[attributes.step] !== currentStep) {
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
StackEngine.prototype.CustomOperation = function (
  frameGroup,
  pixiProcess,
  currentStep,
  customStepSeqNr,
  spaceRequiredFactor,
  isMasterStep,
  frameGroupIndex
) {
  // Construct the process name based on the operation type
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

  // Inherit from BPPOperationBlock to track execution
  this.__base__ = BPPOperationBlock;
  this.__base__(processName, frameGroup, true /* trackable */);

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

  this._run = function () {
    // If this is a master step, clear existing active frames and retrieve master files
    if (isMasterStep) {

      while (frameGroup.fileItems.length > 0) {
        frameGroup.removeItem(0);
      }

      let masterFiles = [];
      // Loop through all master type and variant combinations
      for (let type of WBPPMasterTypes) {
        for (let variant of WBPPMasterVariants) {
          let masterKey = type + '_' + variant;

          // Retrieve the processed master file first, otherwise fallback to the original master file
          let masterFile;
          if (WBPPProcessedMasterGroups.hasOwnProperty(frameGroupIndex)) {
            masterFile = WBPPProcessedMasterGroups[frameGroupIndex][masterKey];
          } else {
            masterFile = frameGroup.getMasterFileName(
              WBPPMasterType[type],
              WBPPMasterVariant[variant]
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
      for (let masterFile of masterFiles) {
        let fileItem = new FileItem(masterFile);
        frameGroup.fileItems.push(fileItem);
      }
    }

    // Retrieve the active frames after modifications
    let activeFrames = frameGroup.activeFrames();

    // If no active frames exist, terminate the function
    if (activeFrames.length == 0) return OperationBlockStatus.DONE;

    // Set the output directory, removing frameGroup.folderName() for master files
    let outputFolder = WBPPUtils.existingDirectory(
      engine.outputDirectory +
        '/' +
        engine.customStepName(currentStep) +
        (isMasterStep ? '' : '/' + frameGroup.folderName())
    );

    // Define the custom process instance
    var P = pixiProcess;

    // Track the number of successfully processed frames
    let nSuccess = 0;
    let nFailed = 0;

    // Loop through all active frames and process them
    for (let i = 0; i < activeFrames.length; i++) {
      let filePath = activeFrames[i].current;

      // Open the image file
      let w = ImageWindow.open(filePath);
      if (w.length == 0) {
        // Mark frame as failed if unable to load
        activeFrames[i].processingFailed();
        nFailed++;
        continue;
      }

      // Close all additional windows except the first
      for (let k = 1; k < w.length; k++) w[k].forceClose();

      // Execute the custom process
      let view = w[0].mainView;
      let outputFile =
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
        // Identify the correct master type and store the processed file
        for (let type of WBPPMasterTypes) {
          for (let variant of WBPPMasterVariants) {
            let masterKey = type + '_' + variant;
            let existingMasterFile = frameGroup.getMasterFileName(
              WBPPMasterType[type],
              WBPPMasterVariant[variant]
            );

            if (
              existingMasterFile &&
              File.extractName(existingMasterFile) ===
                File.extractName(outputFile)
            ) {
              if (!WBPPProcessedMasterGroups.hasOwnProperty(frameGroupIndex)) {
                WBPPProcessedMasterGroups[frameGroupIndex] = {}; // Create a new dictionary for key j
              }
              WBPPProcessedMasterGroups[frameGroupIndex][masterKey] =
                outputFile;
              break; // Exit inner loop once we find a match
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
};

// Assign the prototype to BPPOperationBlock
StackEngine.prototype.CustomOperation.prototype = new BPPOperationBlock();

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FILTER PREVIOUSLY RETRIEVED PROCESS LIST FOR EACH OF THE FRAME GROUPS AND CALL THE SCHEDULER TO ADD THE STEP TO THE PIPELINE AND EXECUTE THE PROCESS
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

StackEngine.prototype.getAndScheduleProcesses = function (
  groups,
  currentStep,
  isMasterStep
) {
  var imageTypeMapping = {
    light: ImageType.LIGHT,
    dark: ImageType.DARK,
    bias: ImageType.BIAS,
    flat: ImageType.FLAT,
  };

  var processesForCurrentStep = engine.extractProcessesFromWBPP(currentStep);
  // loop on full list of processes applicable to current step
  // filter them and apply only on applicable groups
  // schedule those processes for the groups
  for (let j = 0; j < groups.length; ++j) {
    var processListToApply = [];
    for (let i = 0; i < processesForCurrentStep.length; ++i) {
      var processToAdd = true;
      if (
        groups[j].associatedRGBchannel != WBPPAssociatedChannel.COMBINED_RGB &&
        groups[j].imageType == ImageType.LIGHT
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
              if (groupkeyword != key) {
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
    for (let p = 0; p < processListToApply.length; ++p) {
      spaceRequiredFactor *= engine.processSizeFactor(processListToApply[p]);
    }
    for (let p = 0; p < processListToApply.length; ++p) {
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
      let customOperation = new engine.CustomOperation(
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

let build = () => {

  // pre-process groups first
  let groupsPRE = engine.groupsManager.groupsForMode(WBPPGroupingMode.PRE);

  // CALIBRATION
  for (let i = 0; i < groupsPRE.length; ++i) {
    if (groupsPRE[i].imageType == ImageType.LIGHT) {
      let logEnv = {
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
      let cg = engine.getCalibrationGroupsFor(groupsPRE[i]);
      if (cg.masterBias || cg.masterDark || cg.masterFlat) {
        let calibrationOperation = new engine.calibrationOperation(
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
    var cg = engine.getCalibrationGroupsFor(groupsToCalibrate[j]);

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
  for (let i = 0; i < groupsPRE.length; ++i) {
    // LINEAR PATTERN SUBTRACTION
    if (engine.linearPatternSubtraction) {
      //   engine.getAndScheduleProcesses(groupsPRE, customStep.onLPSStart, false);

      let logEnv = {
        processLogger: engine.processLogger,
      };
      // log header
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.newLine();
        env.params.processLogger.addMessage(
          '<b>********************</b> <i>LINEAR DEFECTS CORRECTION</i> <b>********************</b>'
        );
      }, logEnv);

      let LPSOperation = new engine.LPSOperation();
      engine.WS.LPS.size += LPSOperation.spaceRequired();
      engine.operationQueue.addOperation(LPSOperation);

      // log footer
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.addMessage('<b>' + SEPARATOR + '</b>');
        env.params.processLogger.newLine();
      }, logEnv);
      //   engine.getAndScheduleProcesses(groupsPRE, customStep.onLPSEnd, false);
    }
  }
  // COSMETIC CORRECTON AND DEBAYER

  for (let i = 0; i < groupsPRE.length; ++i) {
    if (groupsPRE[i].imageType == ImageType.LIGHT) {
      let logEnv = {
        processLogger: engine.processLogger,
        group: groupsPRE[i],
      };

      let needsCC =
        groupsPRE[i].ccData.CCTemplate &&
        groupsPRE[i].ccData.CCTemplate.length > 0;
      let needsDebayer = groupsPRE[i].isCFA;

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
        let cosmeticCorretcionOperation =
          new engine.CosmeticCorrectionOperation(groupsPRE[i]);
        engine.WS.cosmeticCorrection.size +=
          cosmeticCorretcionOperation.spaceRequired();
        engine.operationQueue.addOperation(cosmeticCorretcionOperation);
      }

      // debayer
      if (needsDebayer) {
        let debayerOperation = new engine.DebayerOperation(groupsPRE[i]);
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
  let groupsPOST = engine.groupsManager
    .groupsForMode(WBPPGroupingMode.POST)
    .filter(g => g.isActive);

  // REFERENCE FRAME DATA PREPARATION
  if (!engine.reuseLastReferenceFrames)
    engine.operationQueue.addOperation(
      new engine.ReferenceFrameDataPreparationOperation()
    );

  // MEASUREMENT OPERATION
  let generateSubframesWeights =
    engine.subframeWeightingEnabled &&
    (engine.subframesWeightsMethod == WBPPSubframeWeightsMethod.FORMULA ||
      engine.integrate);
  let measureForBestFrameSelection =
    (engine.imageRegistration || engine.fastMode) &&
    engine.bestFrameReferenceMethod != WBPPBestReferenceMethod.MANUAL &&
    !engine.reuseLastReferenceFrames;
  let measureImages =
    generateSubframesWeights ||
    measureForBestFrameSelection ||
    engine.localNormalization;
  if (!engine.groupsManager.isEmpty() && measureImages) {
    engine.operationQueue.addOperation(new engine.MeasurementOperation());
    if (
      engine.subframeWeightingEnabled &&
      engine.subframesWeightsMethod == WBPPSubframeWeightsMethod.FORMULA
    )
      engine.operationQueue.addOperation(
        new engine.CustomFormulaWeightsGenerationOperation()
      );
    if (
      engine.subframesWeightsMethod != WBPPSubframeWeightsMethod.PSFScaleSNR &&
      engine.integrate &&
      engine.groupsManager.regularIntegrationGroupExists()
    )
      engine.operationQueue.addOperation(
        new engine.BadFramesRejectionOperation()
      );
  }

  // SET THE REFERENCE FRAME (for both post calibration group with or without fast integration )
  let regularRegistrationGroupExists =
    engine.imageRegistration &&
    engine.groupsManager.regularIntegrationGroupExists();
  if (
    !engine.groupsManager.isEmpty() &&
    (regularRegistrationGroupExists ||
      (engine.groupsManager.fastIntegrationGroupExists() && engine.integrate))
  )
    if (!engine.reuseLastReferenceFrames)
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
    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          WBPPAssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('IMAGE REGISTRATION')
          );
        }, logEnv);

        let registrationOperation = new engine.RegistrationOperation(
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
    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          WBPPAssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        let logEnv = {
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
          let lnReferenceFrameSelectionOperation =
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
    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
          WBPPAssociatedChannel.COMBINED_RGB &&
        !groupsPOST[i].fastIntegrationData.enabled;

      if (standardPostCalibrationProcessing) {
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('LOCAL NORMALIZATION')
          );
        }, logEnv);

        let lnOperation = new engine.LocalNormalizationOperation(groupsPOST[i]);
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

    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        WBPPAssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        !groupsPOST[i].fastIntegrationData.enabled
      ) {
        // Image Integration
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('IMAGE INTEGRATION')
          );
        }, logEnv);

        let imageIntegrationOperation = new engine.ImageIntegrationOperation(
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

    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        WBPPAssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        groupsPOST[i].fastIntegrationData.enabled
      ) {
        // Fast Integration
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('FAST INTEGRATION')
          );
        }, logEnv);

        let fastIntegrationOperation = new engine.FastIntegrationOperation(
          groupsPOST[i]
        );
        engine.WS.fastIntegration.size +=
          fastIntegrationOperation.spaceRequired();
        let imageIntegrationOperation = new engine.ImageIntegrationOperation(
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

    for (let i = 0; i < groupsPOST.length; ++i) {
      let standardPostCalibrationProcessing =
        groupsPOST[i].associatedRGBchannel !=
        WBPPAssociatedChannel.COMBINED_RGB;

      if (
        standardPostCalibrationProcessing &&
        groupsPOST[i].isDrizzleEnabled()
      ) {
        // Fast Integration
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('DRIZZLE INTEGRATION')
          );
        }, logEnv);

        let drizzleIntegrationOperation =
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
      let logEnv = {
        processLogger: engine.processLogger,
      };

      // log header
      engine.operationQueue.addOperationBlock(env => {
        console.writeln();
        env.params.processLogger.addMessage(
          '<b>*********************** <i>AUTO CROP</i> ***********************</b>'
        );
        console.writeln(SEPARATOR);
        console.writeln('* Begin autocrop of master light frames');
        console.writeln(SEPARATOR);
      }, logEnv);

      let autocropOperation = new engine.AutoCropOperation();
      engine.WS.integration.size += autocropOperation.spaceRequired();
      engine.operationQueue.addOperation(autocropOperation);

      // log footer
      engine.operationQueue.addOperationBlock(env => {
        env.params.processLogger.addMessage('<b>' + SEPARATOR + '</b>');
        env.params.processLogger.newLine();
        console.writeln(SEPARATOR);
        console.writeln('* End autocrop of master light frames');
        console.writeln(SEPARATOR);
      }, logEnv);
    }

    // process the RGB recombination groups, this needs to be done at the end to ensure that all
    // gray R,G and B masters have been integrated
    for (let i = 0; i < groupsPOST.length; ++i) {
      let logEnv = {
        processLogger: engine.processLogger,
        group: groupsPOST[i],
      };

      // RGB RECOMBINATION
      if (
        groupsPOST[i].associatedRGBchannel == WBPPAssociatedChannel.COMBINED_RGB
      ) {
        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('RGB COMBINATION')
          );
        }, logEnv);

        // RGB Recombination
        let recombinationOperation = new engine.RGBRecombinationOperation(
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
      for (let i = 0; i < groupsPOST.length; ++i) {
        // Image Integration
        let logEnv = {
          processLogger: engine.processLogger,
          group: groupsPOST[i],
        };

        // log header
        engine.operationQueue.addOperationBlock(env => {
          env.params.processLogger.addMessage(
            env.params.group.logStringHeader('ASTROMETRIC SOLUTION')
          );
        }, logEnv);

        let plateSolveOperation = new engine.PlateSolveOperation(groupsPOST[i]);
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

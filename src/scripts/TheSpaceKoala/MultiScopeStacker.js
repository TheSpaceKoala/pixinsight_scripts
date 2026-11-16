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
// Multi Scope Stacker
// Version: V0.1.2 - 20260801
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
// MULTI-SCOPE POST GROUP REGROUPING
///////////////////////////////////////////////////////////////////////////////////

StackEngine.prototype.multiScopePostGroupKey = function (group) {
  var keywordPairs = [];

  if (group.keywords != undefined) {
    for (var keyword in group.keywords) {
      if (group.keywords.hasOwnProperty(keyword)) {
        keywordPairs.push(
          keyword.toLowerCase() +
            '=' +
            (group.keywords[keyword] == undefined
              ? ''
              : group.keywords[keyword].toString())
        );
      }
    }
  }

  keywordPairs.sort();

  return (
    'imageType=' +
    group.imageType +
    '|filter=' +
    group.filter +
    '|binning=' +
    group.binning +
    '|exposure=' +
    group.exposureTime +
    '|isCFA=' +
    group.isCFA +
    '|rgb=' +
    group.associatedRGBchannel +
    '|post=' +
    (keywordPairs.length > 0 ? keywordPairs.join('|') : 'none')
  );
};

StackEngine.prototype.removeGroupFromGroupsManager = function (groupToRemove) {
  var allGroups = this.groupsManager.groups;

  for (var i = allGroups.length - 1; i >= 0; --i) {
    if (allGroups[i] === groupToRemove) {
      this.groupsManager.removeGroupAtIndex(i);
      return true;
    }
  }

  return false;
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

StackEngine.prototype.mergeMultiScopePostGroup = function (
  keeperGroup,
  donorGroup
) {
  var donorItems = [];

  for (var j = 0; j < donorGroup.fileItems.length; ++j) {
    donorItems.push(donorGroup.fileItems[j]);
  }

  for (var j = 0; j < donorItems.length; ++j) {
    keeperGroup.fileItems.push(donorItems[j]);

    if (donorItems[j] != undefined && donorItems[j].exposureTime != undefined) {
      keeperGroup.addExposureTime(donorItems[j].exposureTime);
    }
  }

  if (
    engine.autoIntegrationMode &&
    keeperGroup.mode == BPP.GroupingMode.POST &&
    keeperGroup.imageType == ImageType.Light &&
    keeperGroup.fileItems.length >= BPP.Defaults.autoFastIntegrationThreshold &&
    keeperGroup.fastIntegrationData.manuallyChanged == false
  ) {
    keeperGroup.enableFastIntegration(true, true);
    if (engine.automaticFIgroups.indexOf(keeperGroup) < 0) {
      engine.automaticFIgroups.push(keeperGroup);
    }
  }
};

StackEngine.prototype.regroupPostGroupsForMultiScope = function (groups) {
  var regroupedGroups = [];
  var keeperByKey = {};
  var groupsToRemove = [];

  for (var i = 0; i < groups.length; ++i) {
    var group = groups[i];
    var eligibleForRegrouping =
      group.isActive &&
      group.imageType == ImageType.Light &&
      group.associatedRGBchannel != BPP.AssociatedChannel.COMBINED_RGB;

    if (!eligibleForRegrouping) {
      regroupedGroups.push(group);
      continue;
    }

    // Keep the usual post-group identity, but ignore frame size so resolution-only splits collapse.
    var regroupingKey = this.multiScopePostGroupKey(group);

    if (!keeperByKey.hasOwnProperty(regroupingKey)) {
      keeperByKey[regroupingKey] = group;
      regroupedGroups.push(group);
      continue;
    }

    var keeperGroup = keeperByKey[regroupingKey];
    this.mergeMultiScopePostGroup(keeperGroup, group);
    group.isActive = false;
    group.__purged__ = true;
    groupsToRemove.push(group);

    console.noteln(
      "MultiScopeStacker regrouped POST group '" +
        group.folderName() +
        "' into '" +
        keeperGroup.folderName() +
        "' using key [" +
        regroupingKey +
        ']'
    );
  }

  for (var i = 0; i < groupsToRemove.length; ++i) {
    this.removeGroupFromGroupsManager(groupsToRemove[i]);
  }

  this.removePurgedElements();

  return this.groupsManager
    .groupsForMode(BPP.GroupingMode.POST)
    .filter(g => g.isActive);
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
  // LINEAR PATTERN SUBTRACTION
  if (engine.linearPatternSubtraction) {
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
  var groupsPOST = engine.regroupPostGroupsForMultiScope(
    engine.groupsManager.groupsForMode(BPP.GroupingMode.POST)
  );
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
      engine.operationQueue.addOperation(new engine.FrameSelectionOperation());
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

  // exit if no registration, local normalization and integration needs to be performed
  if (
    !generateSubframesWeights &&
    !engine.imageRegistration &&
    !engine.localNormalization &&
    !engine.integrate
  )
    return;

  // POST-PROCESS GROUPS - REGISTRATION
  if (engine.imageRegistration) {
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

  }
};

build();

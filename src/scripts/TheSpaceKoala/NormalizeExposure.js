// ==================================================================================
// NormalizeExposureRegion.js
//
// Target runtime: PixInsight PJSR 2.0 (V8).
// Normalizes the exposure of each image so that the per-channel median
// of a fixed rectangular region reaches a target level.
// Works interactively, on dragged views, or in batch mode (ProcessContainer).
//
// Author: Luca Bartek / The Space Koala
// ==================================================================================

#feature-id    NormalizeExposureRegion : Utilities > NormalizeExposureRegion
#feature-info  Normalizes the target image from a reference rectangular sample region.

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/UndoFlag.jsh>

// ===== PARAMETERS YOU CAN CHANGE =====
var X0 = 0;           // top-left x of reference area
var Y0 = 0;           // top-left y of reference area
var WIDTH = 500;      // width of reference area
var HEIGHT = 500;     // height of reference area
var TARGET = 0.01;    // target median level (0..1)
// =====================================

#define TITLE   "NormalizeExposureRegion"
#define VERSION "V1.0.0"

// Compute median of a rectangular area for one channel
function rectMedian( img, channel, x0, y0, w, h )
{
   var samples = [];
   for ( var y = y0; y < y0 + h && y < img.height; ++y )
      for ( var x = x0; x < x0 + w && x < img.width; ++x )
         samples.push( img.sample( x, y, channel ) );

   samples.sort( function(a,b){ return a-b; } );
   var mid = Math.floor(samples.length/2);
   return (samples.length % 2) ? samples[mid]
                               : 0.5*(samples[mid-1]+samples[mid]);
}

// Normalize one view
function normalizeView( view )
{
   var img = view.image;
   var nChannels = img.numberOfChannels;

   // compute per-channel factors
   var factors = [];
   for ( var c = 0; c < nChannels; ++c )
   {
      var med = rectMedian( img, c, X0, Y0, WIDTH, HEIGHT );
      factors[c] = (med > 0) ? TARGET / med : 1.0;
      console.writeln( "Channel " + c + " median=" + med.toFixed(6) +
                       " factor=" + factors[c].toFixed(6) );
   }

   // apply scaling in a write session
   view.beginProcess( UndoFlag_NoSwapFile );
   try {
      for ( var c = 0; c < nChannels; ++c )
      {
         var k = factors[c];
         for ( var y = 0; y < img.height; ++y )
         {
            for ( var x = 0; x < img.width; ++x )
            {
               var v = img.sample( x, y, c );
               img.setSample( v * k, x, y, c );
            }
         }
      }
   }
   finally {
      view.endProcess();
   }

   console.writeln( "Normalized " + view.fullId +
                    " to target=" + TARGET );
}
// ---------------- Minimal GUI ----------------
function NormalizeExposureRegionDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   this.windowTitle = TITLE + " " + VERSION;

   this.newInstanceButton = new ToolButton( this );
   this.newInstanceButton.icon = this.scaledResource(
      ":/process-interface/new-instance.png" );
   this.newInstanceButton.setScaledFixedSize( 24, 24 );
   this.newInstanceButton.toolTip = "Drag to create a process icon.";
   var self = this;
   this.newInstanceButton.onMousePress = function()
   {
      Parameters.clear(); // no user params in this version
      self.newInstance();
   };

   this.runButton = new PushButton( this );
   this.runButton.text = "Run";
   this.runButton.icon = this.scaledResource( ":/icons/power.png" );
   this.runButton.onClick = function()
   {
      if ( !ImageWindow.activeWindow.isNull )
      {
         normalizeView( ImageWindow.activeWindow.mainView );
         self.ok();
      }
      else
         console.criticalln( "No active image window." );
   };

   this.cancelButton = new PushButton( this );
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource( ":/icons/close.png" );
   this.cancelButton.onClick = function(){ self.cancel(); };

   var row = new HorizontalSizer; row.spacing = 8;
   row.add( this.newInstanceButton );
   row.addStretch();
   row.add( this.runButton );
   row.add( this.cancelButton );

   this.sizer = new VerticalSizer; this.sizer.margin = 10; this.sizer.spacing = 6;
   this.sizer.add( row );
   this.adjustToContents();
}
NormalizeExposureRegionDialog.prototype = new Dialog;

// ---------------- Main ----------------
function main()
{
   console.writeln( "=== " + TITLE + " " + VERSION + " ===" );

   if ( Parameters.isViewTarget || Parameters.isGlobalTarget )
   {
      var v = Parameters.targetView;
      if ( !v.isNull )
         normalizeView( v );
      else if ( !ImageWindow.activeWindow.isNull )
         normalizeView( ImageWindow.activeWindow.mainView );
      else
         console.criticalln( "No valid target view." );
      return;
   }

   var dlg = new NormalizeExposureRegionDialog;
   dlg.execute();
}

main();

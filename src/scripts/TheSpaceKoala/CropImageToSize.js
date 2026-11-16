// ==================================================================================
// CropImageToSize.js - CenterCrop2200
//
// Target runtime: PixInsight PJSR 2.0 (V8).
// Supports direct execution, drag-to-image, and process-instance execution.
// ==================================================================================

#feature-id    CenterCrop2200 : Utilities > CenterCrop2200
#feature-info  Crops the target image to a centered 2200x2200 frame.

#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/DataType.jsh>
#include <pjsr/UndoFlag.jsh>

#define TITLE   "CenterCrop2200"
#define VERSION "V1.0.3"

function log(k,v){ console.writeln(k + ": " + v); }
function crit(v){ console.criticalln(v); }

function cropTo2200(view)
{
   var TARGET = 2200;
   var w = view.image.width, h = view.image.height;

   log("Target view id", view.id ? view.id : "<no id>");
   log("Original size", w + " x " + h);

   if (w < TARGET || h < TARGET) { crit("Image smaller than 2200 in at least one dimension."); return false; }

   var dx = w - TARGET, dy = h - TARGET;
   var L = Math.floor(dx/2);
   var R = dx - L;
   var T = Math.floor(dy/2);
   var B = dy - T;

   log("Pixels to remove (L,R,T,B)", L + "," + R + "," + T + "," + B);

   var P = new Crop;
   // Negative = crop, positive = expand
   P.leftMargin   = -L;
   P.rightMargin  = -R;
   P.topMargin    = -T;
   P.bottomMargin = -B;
   P.mode = Crop.prototype.AbsolutePixels;
   P.metric = false;
   P.noGUIMessages = false;

   var ok = P.executeOn(view);
   if (!ok) { crit("Crop failed."); return false; }

   log("New size", view.image.width + " x " + view.image.height);
   if (view.image.width !== TARGET || view.image.height !== TARGET)
      crit("Size mismatch after crop!");
   else
      log("Result", "OK 2200 x 2200");
   return ok;
}

function resolveTargetViewForExecution()
{
   log("Parameters.isViewTarget", Parameters.isViewTarget);
   log("Parameters.isGlobalTarget", Parameters.isGlobalTarget);

   if (Parameters.isViewTarget)
   {
      var tv = Parameters.targetView;
      log("Has Parameters.targetView", (!tv.isNull));
      if (!tv.isNull) return tv;
   }

   // Batch/ProcessContainer typically makes the item the active window
   var aw = ImageWindow.activeWindow;
   log("ActiveWindow.isNull", aw.isNull);
   if (!aw.isNull)
   {
      log("ActiveWindow.id", aw.mainView && aw.mainView.id ? aw.mainView.id : "<no id>");
      return aw.mainView;
   }

   // Last resort: if exactly one image window is open, use it
   var wins = ImageWindow.windows;
   log("Open windows", wins.length);
   if (wins.length === 1) return wins[0].mainView;

   return null;
}

// ---------------- Minimal GUI (triangle + Run/Cancel) ----------------
function CenterCrop2200Dialog()
{
   this.__base__ = Dialog; this.__base__();
   this.windowTitle = TITLE + " " + VERSION;

   this.newInstanceButton = new ToolButton(this);
   this.newInstanceButton.icon = this.scaledResource(":/process-interface/new-instance.png");
   this.newInstanceButton.setScaledFixedSize(24,24);
   this.newInstanceButton.toolTip = "Drag to create a process icon.";
   var self = this;
   this.newInstanceButton.onMousePress = function(){
      Parameters.clear(); // no params yet
      self.newInstance();
   };

   this.runButton = new PushButton(this);
   this.runButton.text = "Run";
   this.runButton.icon = this.scaledResource(":/icons/power.png");
   this.runButton.onClick = function(){
      var v = resolveTargetViewForExecution();
      if (v) { cropTo2200(v); self.ok(); } else crit("No target view resolved.");
   };

   this.cancelButton = new PushButton(this);
   this.cancelButton.text = "Cancel";
   this.cancelButton.icon = this.scaledResource(":/icons/close.png");
   this.cancelButton.onClick = function(){ self.cancel(); };

   var row = new HorizontalSizer; row.spacing = 8;
   row.add(this.newInstanceButton); row.addStretch();
   row.add(this.runButton); row.add(this.cancelButton);

   this.sizer = new VerticalSizer; this.sizer.margin = 10; this.sizer.spacing = 6;
   this.sizer.add(row);
   this.adjustToContents();
}
CenterCrop2200Dialog.prototype = new Dialog;

// ---------------- Main ----------------
(function(){
   log("=== " + TITLE + " " + VERSION + " ===", "");
   if (Parameters.isViewTarget || Parameters.isGlobalTarget)
   {
      // Executed as a process instance (drag-to-view or ProcessContainer)
      var v = resolveTargetViewForExecution();
      if (v) cropTo2200(v); else crit("No target view resolved (batch?).");
      return;
   }

   // Interactive GUI
   var dlg = new CenterCrop2200Dialog;
   dlg.execute();
})();

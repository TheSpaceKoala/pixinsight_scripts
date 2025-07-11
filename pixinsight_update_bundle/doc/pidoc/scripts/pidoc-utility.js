/*
 * PixInsight Reference Documentation System
 *
 * Utility JavaScript routines
 * Updated 2013 October 3
 *
 * Copyright (c) 2010-2013 Pleiades Astrophoto S.L. All Rights Reserved.
 */

/*
 * Returns an array with the x,y pixel position of an object on the current document.
 */
function pidoc_findPos( obj )
{
   var dx = 0;
   var dy = 0;
   while ( obj )
   {
      dx += obj.offsetLeft;
      dy += obj.offsetTop;
      obj = obj.offsetParent;
   }
   return new Array( dx, dy );
}

/*
 * Toggles the style.display CSS property of an object with id.
 */
function pidoc_toggleDisplay( id )
{
   var obj = document.getElementById( id );
   if ( obj )
      obj.style.display = obj.style.display ? "" : "none";
}

function pidoc_toggleSection( sectionId, button )
{
   var obj = document.getElementById( sectionId );
   if ( obj )
   {
      var wasVisible = obj.style.display.length == 0;
      obj.style.display = wasVisible ? "none" : "";
      button.innerHTML = wasVisible ? "[show]" : "[hide]";
   }
}

/*
 * Sets the 'src' attribute of an image selected by its id.
 */
function pidoc_setImgSrc( imgId, imgSrc )
{
   var obj = document.getElementById( imgId );
   if ( obj )
      obj.src = imgSrc;
}

/*
 * Hides a group of objects by setting to zero the style.opacity CSS property.
 */
function pidoc_hideGroup( elementBaseId, numberOfElements )
{
   for ( var i = 1; i <= numberOfElements; ++i )
   {
      var obj = document.getElementById( elementBaseId + "_" + i.toString() );
      if ( obj )
         obj.style.opacity = 0;
   }
}

/*
 * Sets the style.opacity CSS property of an object with id.
 */
function pidoc_setOpacity( id, opacity )
{
   var obj = document.getElementById( id );
   if ( obj )
      obj.style.opacity = opacity;
}

/*
 * onmousemove event listener - track pointer coordinates relative to window.
 * This means that we have to "position: fixed;" all dynamically moving items.
 */
var pidoc_mouseX = 0;
var pidoc_mouseY = 0;
function pidoc_listenMouseMove( event )
{
   event = event || window.event; // IE-ism
   pidoc_mouseX = event.clientX;
   pidoc_mouseY = event.clientY;
}

window.onmousemove = pidoc_listenMouseMove;

/*
 * Document elements that are generated and managed dynamically.
 */
function pidoc_generateDynamicContents()
{
   // Tooltip window
   document.writeln( "<div class=\"pidoc_referenceTooltipWindow\" id=\"referenceToolTip\"></div>" );
}

/*
 * Open the reference tooltip window for a given reference item at the current
 * pointer coordinates.
 */
function pidoc_showReferenceToolTip( refItem )
{
   var obj = document.getElementById( "referenceToolTip" );
   if ( obj )
   {
      obj.innerHTML = refItem.getAttribute( "data-tooltip" );
      obj.style.zIndex = 98;
      obj.style.opacity = 1;

      var s = window.getComputedStyle( obj );
      var w = parseInt( s.width ) + parseInt( s.paddingLeft ) + parseInt( s.paddingRight );
      var h = parseInt( s.height ) + parseInt( s.paddingTop ) + parseInt( s.paddingBottom );
      var d = 12;

      if ( pidoc_mouseX + w+d < window.innerWidth )
         obj.style.left = (pidoc_mouseX + d).toString() + "px";
      else
         obj.style.left = (pidoc_mouseX - w-d).toString() + "px";

      if ( pidoc_mouseY - h-d > 0 )
         obj.style.top = (pidoc_mouseY - h-d).toString() + "px";
      else
         obj.style.top = (pidoc_mouseY + d).toString() + "px";
   }
}

/*
 * Close the reference tooltip window.
 */
function pidoc_hideReferenceToolTip()
{
   var obj = document.getElementById( "referenceToolTip" );
   if ( obj )
   {
      obj.style.zIndex = -1;
      obj.style.opacity = 0;
   }
}

/*
 * PixInsight Reference Documentation System
 *
 * Utility JavaScript routines
 * Updated 2011 December 2
 *
 * Copyright (c) 2010-2011 Pleiades Astrophoto S.L. All Rights Reserved.
 */

/*
 * Add some useful methods to the String object, not part of ECMA.
 */
function String_isEmpty()
{
   return this.length == 0;
}
function String_has( s )
{
   return this.indexOf( s ) >= 0;
}
function String_beginsWith( s )
{
   return !this.isEmpty() && this.indexOf( s ) == 0;
}
function String_endsWith( s )
{
   return !this.isEmpty() && !s.isEmpty() && this.indexOf( s ) == this.length - s.length;
}
String.prototype.isEmpty = String_isEmpty;
String.prototype.has = String_has;
String.prototype.beginsWith = String_beginsWith;
String.prototype.endsWith = String_endsWith;

/*
 * Returns an array with the x,y pixel position of an object on the current document.
 */
function findPos( obj )
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
function toggleDisplay( id )
{
   var obj = document.getElementById( id );
   if ( obj )
      obj.style.display = obj.style.display ? "" : "none";
}

/*
 * Portable routine to set the 'src' attribute of an image selected by its id.
 */
function setImgSrc( imgId, imgSrc )
{
   var obj = document.getElementById( imgId );
   if ( obj )
      obj.src = imgSrc;
}

/*
 * Hides a group of objects by setting to zero the style.opacity CSS property.
 */
function hideGroup( elementBaseId, numberOfElements )
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
function setOpacity( id, opacity )
{
   var obj = document.getElementById( id );
   if ( obj )
      obj.style.opacity = opacity;
}

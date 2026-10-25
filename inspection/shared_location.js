'use strict';
// Exact-view fragment encoding only. Identity checks stay in SavedLocation.
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const api=factory(node?require('./saved_location.js'):root.SavedLocation);
 if(node)module.exports=api;
 else root.SharedLocation=api;
})(typeof globalThis==='object'?globalThis:this,function(saved){
 const MAX_HASH_LENGTH=16384,PREFIX='#view=';
 function demand(condition,message){if(!condition)throw new Error(message);}
 function createFragment(manifest,caseIndex,recordIndex,frameIndex,rotation){
  const value=saved.createSavedLocation(manifest,caseIndex,recordIndex,frameIndex,rotation);
  const hash=PREFIX+encodeURIComponent(JSON.stringify(value));
  demand(hash.length<=MAX_HASH_LENGTH,'The exact-view link exceeds the 16 KiB fragment limit.');
  return hash;
 }
 function parseFragment(hash,manifest){
  demand(typeof hash==='string'&&hash.startsWith(PREFIX),'This is not a supported exact-view link.');
  demand(hash.length>PREFIX.length,'The exact-view link has no saved location.');
  demand(hash.length<=MAX_HASH_LENGTH,'The exact-view link exceeds the 16 KiB fragment limit.');
  const payload=hash.slice(PREFIX.length);let text;
  try{text=decodeURIComponent(payload);}catch{throw new Error('The exact-view link has invalid percent encoding.');}
  demand(encodeURIComponent(text)===payload,'The exact-view link must contain one canonically encoded saved location.');
  // Validate the complete supplied object, then retain its original JSON for the loader.
  saved.parseSavedLocation(text,manifest);
  return text;
 }
 return Object.freeze({MAX_HASH_LENGTH,createFragment,parseFragment});
});

/* Google SDK substitute: tests must never bill or contact real Google services. */
module.exports = `
window.__googleState={options:null,fields:null,pin:null,center:null};
class QAMap {
  constructor(node,options){this.node=node;this.options=options;this.listeners={};this.type='roadmap';node.textContent='Google map test fixture';node.addEventListener('click',()=>this.listeners.click&&this.listeners.click({latLng:{lat:()=>7.22,lng:()=>79.82}}));}
  addListener(type,callback){this.listeners[type]=callback;}
  panTo(value){window.__googleState.center=value;}
  setZoom(value){window.__googleState.zoom=value;}
  getMapTypeId(){return this.type;}
  setMapTypeId(value){this.type=value;}
  fitBounds(value){window.__googleState.bounds=value;}
}
class QAMarker {
  constructor(options){this.position=options.position;this.map=options.map;this.listeners={};}
  set position(value){this.value=value;window.__googleState.pin=value;}
  get position(){return this.value;}
  addListener(type,callback){this.listeners[type]=callback;}
}
class QAPlaces extends HTMLElement {
  constructor(options){super();window.__googleState.options=options;this.attachShadow({mode:'open'});}
  connectedCallback(){
    const input=document.createElement('input');input.setAttribute('aria-label','Search Google Maps places');input.placeholder='Search a business, place or address';input.style.width='100%';input.style.boxSizing='border-box';input.style.minHeight='44px';
    const results=document.createElement('div');results.setAttribute('role','listbox');
    input.addEventListener('input',()=>{
      results.replaceChildren();if(input.value.length<3)return;
      const button=document.createElement('button');button.textContent='QA Construction Office, Negombo';button.style.minHeight='44px';button.style.width='100%';
      button.addEventListener('click',()=>{const event=new Event('gmp-select');event.placePrediction={toPlace:()=>({displayName:'QA Construction Office',formattedAddress:'408 QA Road, Negombo, Sri Lanka',location:{lat:()=>7.21,lng:()=>79.81},fetchFields:async value=>{window.__googleState.fields=value.fields;}})};this.dispatchEvent(event);results.replaceChildren();});results.appendChild(button);
    });
    this.shadowRoot.append(input,results);
  }
}
customElements.define('gmp-place-autocomplete',QAPlaces);
window.google={maps:{importLibrary:async name=>name==='maps'?{Map:QAMap}:name==='marker'?{AdvancedMarkerElement:QAMarker}:name==='places'?{PlaceAutocompleteElement:QAPlaces}:{Geocoder:class{async geocode(){return {results:[{formatted_address:'QA Google pinned site, Negombo'}]};}}}}};
window.initGoogleMap();
`;

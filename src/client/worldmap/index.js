import $ from 'jquery';
import 'jquery-mousewheel';
import * as THREE from 'three';
import * as TWEEN from 'tween.js';
import * as d3 from 'd3';

import '../RequestAnimationFrame';
import Stats from '../Stats';
import Trace from '../trace-1.4';

import '../d3.geo.robinson';

import '../three/CanvasRenderer';
import { transformSVGPath } from '../three/d3-threeD';
import '../three/PinchZoomControls';
import '../three/Projector';
import '../three/TessellateModifier';
import '../three/TrackballControls';

import '../jquery/jquery.doubleclick';
import '../jquery/jquery.easing.min';
import '../jquery/jquery.immybox';
import '../jquery/jquery.tipsy';

import '../jquery-ui/jquery-ui-1.12.0.custom/jquery-ui';
import '../jquery-ui/jquery-ui.custom.combobox';

import Config from '../config';
import { formatNumber, toSentenceStart } from '../utils';
import * as CountryDataHelpers from '../utils/countryDataHelpers';
import * as UI from './ui';
import * as Panels from './panel';



THREE.Vector3.prototype.mix = function(v2, factor) {
  this.x = this.x + (v2.x - this.x) * factor;
  this.y = this.y + (v2.y - this.y) * factor;
  this.z = this.z + (v2.z - this.z) * factor;
};

if(!Date.now) Date.now = function() { return new Date().getTime(); };

var stats;
var worldMap;
var container;
var viewportWidth, viewportHeight;
var mouseNormalized = new THREE.Vector3( 0, 0, 1 );
var mouseNormalizedTouchStart = new THREE.Vector3( 0, 0, 1 );
var selectCountryOnTouchEnd = true;
var isMouseDown = false;



function WorldMap() {

  this.geo;
  this.scene = {};
  this.renderer = {};
  this.camera = {};
  this.pointLight;
  this.stage = {};
  this.controls;
  this.projector;
  this.raycaster;
  this.clock;

  this.countries;
  this.visaRequirements;

  this.selectedCountry = null;
  this.selectedDestinationCountry = null;
  this.visaInformationFound = false;
  this.countrySelectionChanged = false;

  this.sphere;
  this.countriesObject3D;

  this.intersectedObject = null;

  this.introRunning = true;

  this.inited = false;
  this.uiReady = false;

  this.mode = 'destinations';
  this.viewMode = '2d';
  this.countryListSorting = '';

  this.maxNumDestinationsFreeOrOnArrival = 0;
  this.maxNumSourcesFreeOrOnArrival = 0;
  this.maxGDP = 0;
  this.maxGDPPerCapita = 0;
  this.maxPopulation = 0;

  this.totalPopulation = 0;
  this.animationProps = {
    interpolatePos: 0.0,
    lineAnimatePos: 0.0,
    lineAnimateOffset: 0.0,
    colorChangeID: 0
  };

}

WorldMap.prototype = {

  initD3: function() {

    const GeoConfig = function() {

      this.projection = d3.geo.robinson();

      // this.projection = d3.geo.mercator(); // default, works
      // this.projection = d3.geo.equirectangular(); // works, needs scale = 0.2
      // this.projection = d3.geo.albers(); // works, needs scale = 0.2
      // this.projection = d3.geo.conicEqualArea(); // recommended for choropleths as it preserves the relative areas of geographic features.
      // this.projection = d3.geo.azimuthalEqualArea(); // also suitable for choropleths

      // var translate = this.projection.translate();
      // translate[0] = 0;
      // translate[1] = 80;

      // this.projection.translate(translate);

      // var rotate = [0, 0, 90];
      // this.projection.rotate(rotate);

      this.projection = this.projection.scale(Config.geoScale);

      this.path = d3.geo.path().projection(this.projection);

    };

    this.geo = new GeoConfig();
  },

  initThree: function() {

    if(Config.usesWebGL) {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        clearAlpha: 0,
        clearColor: 0x000000,
        sortObjects: false
      });
      this.renderer.autoClear = false;
      // this.renderer.setClearColor( 0xBBBBBB, 1 );
      trace('WebGLRenderer, pixel ratio used: ' + this.renderer.getPixelRatio());
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    } else {
      this.renderer = new THREE.CanvasRenderer({
        antialias: true,
        alpha: true,
        clearAlpha: 0,
        clearColor: 0x000000,
        sortObjects: false
      });
      trace('CanvasRenderer');
    }

    this.clock = new THREE.Clock();

    this.projector = new THREE.Projector();
    this.raycaster = new THREE.Raycaster();

    this.renderer.setSize( $(window).width(), $(window).height() );

    // append renderer to dom element
    container.append(this.renderer.domElement);

    // create a scene
    this.scene = new THREE.Scene();

    this.scene.add( new THREE.AmbientLight( 0xffffff ) );

    this.pointLight = new THREE.PointLight(0x000000);
    this.pointLight.position.x = 0.0;
    this.pointLight.position.y = 500.0;
    this.pointLight.position.z = 1000.0;
    this.pointLight.intensity = 1.0;
    this.scene.add(this.pointLight);

    // var light1 = new THREE.DirectionalLight( 0xffffff, 0.5 );
    // light1.position.set( 1, 1, 1 );
    // this.scene.add( light1 );

    // var light2 = new THREE.DirectionalLight( 0xffffff, 1.5 );
    // light2.position.set( 0, -1, 0 );
    // this.scene.add( light2 );

    // put a camera in the scene
    this.camera = new THREE.PerspectiveCamera(Config.cameraFOV, $(window).width() / $(window).height(), 0.1, 20000);
    this.camera.position.x = 0.0;
    this.camera.position.y = 0.0;
    this.camera.position.z = Config.cameraDistance;
    // this.camera.lookAt( { x: this.CAMERA_LX, y: 0, z: this.CAMERA_LZ} );
    this.scene.add(this.camera);

  },


  initControls: function() {
    // trace('initControls()');

    this.controlsTrackball = new THREE.TrackballControls( this.camera, this.renderer.domElement );
    this.controlsTrackball.rotateSpeed = 0.5; // 1.0
    this.controlsTrackball.zoomSpeed = 1.0;
    this.controlsTrackball.panSpeed = 0.25;

    this.controlsTrackball.noRotate = false;
    this.controlsTrackball.noZoom = false;
    this.controlsTrackball.noPan = true;

    this.controlsTrackball.staticMoving = false;
    this.controlsTrackball.dynamicDampingFactor = 0.2;

    this.controlsTrackball.minDistance = Config.cameraDistanceMin;
    this.controlsTrackball.maxDistance = Config.cameraDistanceMax;

    this.controlsTrackball.keys = []; // [ 65 // A, 83 // S, 68 // D ]; // [ rotateKey, zoomKey, panKey ]
    this.controlsTrackball.enabled = false;

    // this.controlsTrackball.clearStateOnMouseUp = false;
    // this.controlsTrackball.setState(2);

    this.controlsPinchZoom = new THREE.PinchZoomControls( this.camera, this.renderer.domElement );
    this.controlsPinchZoom.staticMoving = true;
    this.controlsPinchZoom.minDistance = Config.cameraDistanceMin2D;
    this.controlsPinchZoom.maxDistance = Config.cameraDistanceMax;
    this.controlsPinchZoom.enabled = false;

    this.controls = this.controlsPinchZoom;

  },

  sortCountryListByName: function() {
    var newSorting = 'name';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aName = $(a).data('country').properties.name_long;
        var bName = $(b).data('country').properties.name_long;
        return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
      });
      this.repositionCountryList(li);
    }
  },

  sortCountryListByFreeDestinations: function() {
    var newSorting = 'destinations';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aName = $(a).data('country').numDestinationsFreeOrOnArrival;
        var bName = $(b).data('country').numDestinationsFreeOrOnArrival;
        return ((aName > bName) ? -1 : ((aName < bName) ? 1 : 0));
      });

      $('#country_list').removeClass('numberhidden');
      $('#country_list').addClass('narrownumbers');
      $('#country_list').removeClass('widenumbers');

      li.each(function() {
        var country = $(this).data('country');
        // var width = parseInt(country.numDestinationsFreeOrOnArrival / worldMap.maxNumDestinationsFreeOrOnArrival * 200);
        var num = country.numDestinationsFreeOrOnArrival;
        if(country.destinations.length === 0) {
          num = '?';
        }
        // $(this).find('.box').data('width', width);
        // $(this).find('.box').css('width', width + 'px');
        $(this).find('.box').css('background-color', '#' + country.colorByFreeDestinations.getHexString());
        $(this).find('.number').html(num);
      });

      this.repositionCountryList(li);
    }
  },

  sortCountryListByCurrentFreeSourcesOrDestinations: function() {
    var newSorting = 'sources-or-destinations';
    if(this.countryListSorting !== newSorting || this.countrySelectionChanged) {
      this.countryListSorting = newSorting;
      this.countrySelectionChanged = false;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aCountry = $(a).data('country');
        var bCountry = $(b).data('country');

        var aName = 3 + aCountry.properties.name_long;
        if(aCountry.visa_required === 'no' || aCountry.visa_required === 'on-arrival') {
          aName = 2 + aCountry.properties.name_long;
        } else if(aCountry.visa_required === 'free-eu') {
          aName = 1 + aCountry.properties.name_long;
        } else if(aCountry === worldMap.selectedCountry) {
          aName = 0 + aCountry.properties.name_long;
        }
        var bName = 3 + bCountry.properties.name_long;
        if(bCountry.visa_required === 'no' || bCountry.visa_required === 'on-arrival') {
          bName = 2 + bCountry.properties.name_long;
        } else if(bCountry.visa_required === 'free-eu') {
          bName = 1 + bCountry.properties.name_long;
        } else if(bCountry === worldMap.selectedCountry) {
          bName = 0 + bCountry.properties.name_long;
        }

        return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
      });

      $('#country_list').addClass('numberhidden');
      $('#country_list').removeClass('narrownumbers');
      $('#country_list').removeClass('widenumbers');

      /*
      li.each(function() {
        var t = new TWEEN.Tween({ temp: 0, box: $(this).find('.box'), country: $(this).data('country') })
          .to({ temp: 0 }, 1000)
          .onUpdate(function() {
            this.box.css('background-color', '#' + this.country.color.getHexString());
          })
          .start();

      });
      */

      this.repositionCountryList(li);
    }
  },

  sortCountryListByFreeSources: function() {
    var newSorting = 'sources';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      // li.detach();
      li.sort(function(a, b) {
        var aName = $(a).data('country').numSourcesFreeOrOnArrival;
        var bName = $(b).data('country').numSourcesFreeOrOnArrival;
        return ((aName > bName) ? -1 : ((aName < bName) ? 1 : 0));
      });

      $('#country_list').removeClass('numberhidden');
      $('#country_list').addClass('narrownumbers');
      $('#country_list').removeClass('widenumbers');

      li.each(function() {
        var country = $(this).data('country');
        // var width = parseInt(country.numSourcesFreeOrOnArrival / worldMap.maxNumSourcesFreeOrOnArrival * 200);
        var num = country.numSourcesFreeOrOnArrival;
        // $(this).find('.box').data('width', width);
        // $(this).find('.box').css('width', width + 'px');
        $(this).find('.box').css('background-color', '#' + country.colorByFreeSources.getHexString());
        $(this).find('.number').html(num);
      });

      this.repositionCountryList(li);
    }
  },

  sortCountryListByGDP: function() {
    var newSorting = 'gdp';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aName = $(a).data('country').properties.gdp_md_est;
        var bName = $(b).data('country').properties.gdp_md_est;
        return ((aName > bName) ? -1 : ((aName < bName) ? 1 : 0));
      });

      $('#country_list').removeClass('numberhidden');
      $('#country_list').removeClass('narrownumbers');
      $('#country_list').addClass('widenumbers');

      li.each(function() {
        var country = $(this).data('country');
        var num = Math.round(country.properties.gdp_md_est);
        if(num > 1000) {
          num /= 1000;
          num = formatNumber(num, 0) + ' b USD';
        } else {
          num = formatNumber(num, 0) + ' m USD';
        }
        $(this).find('.number').html(num);
      });

      this.repositionCountryList(li);
    }
  },

  sortCountryListByGDPPerCapita: function() {
    var newSorting = 'gdp-per-capita';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aName = $(a).data('country').properties.gdp_per_capita;
        var bName = $(b).data('country').properties.gdp_per_capita;
        return ((aName > bName) ? -1 : ((aName < bName) ? 1 : 0));
      });

      $('#country_list').removeClass('numberhidden');
      $('#country_list').removeClass('narrownumbers');
      $('#country_list').addClass('widenumbers');

      li.each(function() {
        var country = $(this).data('country');
        var num = Math.round(country.properties.gdp_per_capita);
        num = formatNumber(num, 0) + ' USD';
        $(this).find('.number').html(num);
      });

      this.repositionCountryList(li);
    }
  },

  sortCountryListByPopulation: function() {
    var newSorting = 'population';
    if(this.countryListSorting !== newSorting) {
      this.countryListSorting = newSorting;

      var li = $('#country_list').children('li');
      li.sort(function(a, b) {
        var aName = $(a).data('country').properties.pop_est;
        var bName = $(b).data('country').properties.pop_est;
        return ((aName > bName) ? -1 : ((aName < bName) ? 1 : 0));
      });

      $('#country_list').removeClass('numberhidden');
      $('#country_list').removeClass('narrownumbers');
      $('#country_list').addClass('widenumbers');

      li.each(function() {
        var country = $(this).data('country');
        var num = country.properties.pop_est;
        if(num > 1000000) {
          num = Math.round(num / 1000000) + ' m';
        } else {
          num = formatNumber(num, 0);
        }
        $(this).find('.number').html(num);
      });

      this.repositionCountryList(li);
    }
  },

  repositionCountryList: function(li) {
    var top = 0;

    if($('#country_list').is(':visible')) {
      $('#country_list li').css('transition', 'top 0.5s ease-out');
      li.each(function(i) {
        $(this).css('top', top + 'px');
        $(this).data('height', $(this).height());
        top += $(this).data('height');
      });
    } else {
      $('#country_list li').css('transition', 'none');
      li.each(function(i) {
        $(this).css('top', top + 'px');
        top += $(this).data('height');
      });
    }

  },

  setMode: function(mode) {
    this.mode = mode;

    $('#map_mode .mode').removeClass('active');
    $(this).addClass('active');

    UI.updateLegend(this);

    UI.collapseNavBar();

    worldMap.clearBothSelectedCountries();

    /*
    worldMap.deleteLinesObject();
    worldMap.updateCountrySelection();
    worldMap.updateBufferGeometry();
    */

    worldMap.updateCountryColorsOneByOne();

    UI.updateModeStatement(worldMap);

  },

  initUI: function() {
    UI.createLegend(this);
    UI.updateLegend(this);

    UI.createCountryList(this);
    UI.updateCountryList(this);

    UI.initViewSwitch(this);

    UI.initGeneralElements(this);

    this.inited = true;
  },

  createSphere: function() {
    this.sphere = new THREE.Mesh( new THREE.PlaneGeometry( 700, 700, 24, 96 ), Config.materialSphere );
    this.sphere.name = 'sphere';
    this.scene.add( this.sphere );
    this.sphere.visible = Config.sphereVisible;

    this.sphereGeometry2D = this.sphere.geometry.clone();
    var k;
    for(k = 0; k < this.sphereGeometry2D.vertices.length; k++) {
      this.sphereGeometry2D.vertices[k].x -= 20;
      this.sphereGeometry2D.vertices[k].y -= 90;
      this.sphereGeometry2D.vertices[k].z -= Config.extrudeDepth * 2.0;
    }

    this.sphereGeometry3D = this.sphere.geometry.clone();

    for(k = 0; k < this.sphere.geometry.vertices.length; k++) {
      var spherical = this.geo.projection.invert([ -this.sphere.geometry.vertices[k].x, this.sphere.geometry.vertices[k].y * 2.0 + 250 ]); //  * 2.0 + 260

      spherical[0] = THREE.Math.degToRad(spherical[0]);
      spherical[1] = THREE.Math.degToRad(spherical[1]);

      this.sphereGeometry3D.vertices[k].x = (Config.globeRadius - 1) * Math.cos(spherical[0]) * Math.cos(spherical[1]);
      this.sphereGeometry3D.vertices[k].y = -(Config.globeRadius - 1) * Math.sin(spherical[1]);
      this.sphereGeometry3D.vertices[k].z = (Config.globeRadius - 1) * Math.sin(spherical[0]) * Math.cos(spherical[1]);

      /*
      if(this.sphereGeometry3D.vertices[k].z < 0.0) {
        this.sphereGeometry3D.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);
        //this.sphereGeometry3D.vertices[k].multiplyScalar(0.5);
      } else {
        this.sphereGeometry3D.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);
        //this.sphereGeometry3D.vertices[k].multiplyScalar(1.04);
      }
      */

    }
    // rotate and bake transform into vertices:
    var m = new THREE.Matrix4();
    m.makeRotationX( THREE.Math.degToRad(45) );
    this.sphereGeometry3D.applyMatrix(m);

  },


  createCountries: function() {
    trace('createCountries()');

    $('#loading .details').html('Creating map ...');

    var data = this.dataCountries;

    var start = Date.now();

    this.countriesObject3D = new THREE.Object3D();

    this.countries = [];

    this.trianglesNumTotal = 0;

    var globalPointCount = 0;
    var numVisaRequirementsFound = 0;

    this.countryDropdownChoices = [];

    // features = countries
    var i;
    var destinations;
    for(i = 0; i < data.features.length; i++) {
      var feature = data.features[i];
      destinations = [];

      // trace( feature.properties.name );
      // trace( feature.properties.name_long );
      // trace( feature.properties.name_sort );

      if(feature.properties.name !== 'Antarctica') { //  && feature.properties.name === 'Germany'
        for(var r = 0; r < this.visaRequirements.countries.length; r++) {
          // 199 nationalities travelling to 240 (?) countries, assuming nationals from a country don't need a visa to the sovereignty's main country:
          // if(CountryDataHelpers.matchDestinationToCountryName(feature.properties.name_long, this.visaRequirements.countries[r].name) || CountryDataHelpers.matchDestinationToCountryName(this.visaRequirements.countries[r].name, feature.properties.name_long)) {
          if(CountryDataHelpers.matchDestinationToCountryName(feature.properties.sovereignt, this.visaRequirements.countries[r].name) || CountryDataHelpers.matchDestinationToCountryName(this.visaRequirements.countries[r].name, feature.properties.sovereignt)) {
            // trace('Loading visa requirements for: ' + feature.properties.name);
            destinations = this.visaRequirements.countries[r].destinations;
            numVisaRequirementsFound++;
          }
        }

        // convert SVG data to three.js Shapes array (all shapes in one country):
        var t = this.geo.path(feature);

        if(t !== undefined) {
          var shapes = transformSVGPath( t );

          var pointCount = 0;
          for(var p = 0; p < shapes.length; p++) {
            pointCount += shapes[p].getPoints().length;
          }
          globalPointCount += pointCount;

          this.countries.push({
            properties: feature.properties,
            shapes: shapes,
            destinations: destinations,
            numDestinationsFreeOrOnArrival: 0,
            numSourcesFreeOrOnArrival: 0,
            color: new THREE.Color(Config.colorCountryDefault),
            colorLast: new THREE.Color(Config.colorCountryDefault)
          });

          if(destinations.length === 0) {
            // trace("No visa requirements found for: " + feature.properties.name);
          }

          this.countryDropdownChoices.push({text: feature.properties.name_long, value: feature.properties.name_long});

          // trace(feature.properties.name + " | shapes: " + shapes.length + ", total points: " + pointCount);

        }
      }
    }

    var d;
    var country;
    // remove destinations who's country doesn't exist:
    for(i = 0; i < this.countries.length; i++) {
      destinations = this.countries[i].destinations;
      var destinationsNew = [];
      for(d = 0; d < destinations.length; d++) {
        country = CountryDataHelpers.getCountryByName(this.countries, destinations[d].d_name);
        if(country !== null) {
          destinationsNew.push(destinations[d]);
        }
      }
      this.countries[i].destinations = destinationsNew;

    }

    // count visa-free destinations:
    for(i = 0; i < this.countries.length; i++) {
      destinations = this.countries[i].destinations;

      this.countries[i].numDestinationsFreeOrOnArrival = 0;
      for(d = 0; d < destinations.length; d++) {
        if(destinations[d].visa_required === 'no' || destinations[d].visa_required === 'on-arrival' || destinations[d].visa_required === 'free-eu'
           // || destinations[d].visa_required === 'evisa' || destinations[d].visa_required === 'evisitor' || destinations[d].visa_required === 'eta'
          ) {
          this.countries[i].numDestinationsFreeOrOnArrival++;
        }

      }

      // add main sovereignty, if exists:
      var mainCountry = CountryDataHelpers.getCountryByName(this.countries, this.countries[i].properties.sovereignt);
      if(mainCountry && mainCountry.properties.sovereignt !== this.countries[i].properties.name_long) {
        this.countries[i].numDestinationsFreeOrOnArrival++;
      }

      if(this.countries[i].numDestinationsFreeOrOnArrival > this.maxNumDestinationsFreeOrOnArrival) {
        this.maxNumDestinationsFreeOrOnArrival = this.countries[i].numDestinationsFreeOrOnArrival;
      }

    }

    // count countries from where people can come without a visa > find most open countries:
    for(i = 0; i < this.countries.length; i++) {
      destinations = this.countries[i].destinations;
      for(d = 0; d < destinations.length; d++) {
        if(destinations[d].visa_required === 'no' || destinations[d].visa_required === 'on-arrival' || destinations[d].visa_required === 'free-eu') {
          country = CountryDataHelpers.getCountryByName(this.countries, destinations[d].d_name);
          if(country !== null) {
            country.numSourcesFreeOrOnArrival++;
          }
        }
      }
    }

    for(i = 0; i < this.countries.length; i++) {
      if( this.countries[i].numSourcesFreeOrOnArrival > this.maxNumSourcesFreeOrOnArrival ) {
        this.maxNumSourcesFreeOrOnArrival = this.countries[i].numSourcesFreeOrOnArrival;
      }
      if( this.countries[i].properties.gdp_md_est > this.maxGDP ) {
        this.maxGDP = this.countries[i].properties.gdp_md_est;
      }
      if( this.countries[i].properties.pop_est > this.maxPopulation ) {
        this.maxPopulation = this.countries[i].properties.pop_est;
      }
      this.totalPopulation += this.countries[i].properties.pop_est;
      this.countries[i].properties.gdp_per_capita = this.countries[i].properties.gdp_md_est / this.countries[i].properties.pop_est * 1000000;
      if( this.countries[i].properties.gdp_per_capita > this.maxGDPPerCapita ) {
        if(this.countries[i].properties.gdp_md_est > 100) {
          this.maxGDPPerCapita = this.countries[i].properties.gdp_md_est / this.countries[i].properties.pop_est * 1000000;
          // trace( this.countries[i].properties.name_long );
          // trace( 'population: ' + this.countries[i].properties.pop_est );
          // trace( 'gdp: ' + this.countries[i].properties.gdp_md_est );
          // trace( 'gdp per capita: ' + this.maxGDPPerCapita );
        }
      }
    }

    this.countryDropdownChoices.sort((a, b) => {
      var aName = a.text.toLowerCase();
      var bName = b.text.toLowerCase();
      return ((aName < bName) ? -1 : ((aName > bName) ? 1 : 0));
    });

    var stringLoaded = this.countries.length + ' countries loaded (' + globalPointCount + ' points total) from \'' + Config.mapDataFile + '\'';
    if(Config.mergeDataFromMapDataFile2) {
      stringLoaded += ' and \'' + Config.mapDataFile2 + '\'';
    }
    trace(stringLoaded);

    trace('Visa requirements loaded for ' + numVisaRequirementsFound + ' countries from \'' + Config.visaRequirementsFile + '\'');
    // trace('Max number of visa-free destinations: ' + this.maxNumDestinationsFreeOrOnArrival);
    // trace('Max number of visa-free sources: ' + this.maxNumSourcesFreeOrOnArrival);
    // trace('Total population: ' + this.totalPopulation.formatNumber(0));

    var m = new THREE.Matrix4();
    var m1 = new THREE.Matrix4();
    var m2 = new THREE.Matrix4();
    m1.makeRotationX( Config.globeRotationX );
    m2.makeRotationY( Config.globeRotationY );
    m.multiplyMatrices( m1, m2 );

    for(i = 0; i < this.countries.length; i++) {
      this.countries[i].colorByFreeDestinations = CountryDataHelpers.getCountryColorByFreeDestinations(this.countries[i].numDestinationsFreeOrOnArrival, this.maxNumDestinationsFreeOrOnArrival);
      this.countries[i].colorByFreeSources = CountryDataHelpers.getCountryColorByFreeSources(this.countries[i].numSourcesFreeOrOnArrival, this.maxNumSourcesFreeOrOnArrival);
      this.countries[i].colorByGDP = CountryDataHelpers.getCountryColorByGDP(this.countries[i], this.maxGDP);
      this.countries[i].colorByGDPPerCapita = CountryDataHelpers.getCountryColorByGDPPerCapita(this.countries[i], this.maxGDPPerCapita);
      this.countries[i].colorByPopulation = CountryDataHelpers.getCountryColorByPopulation(this.countries[i], this.maxPopulation);

      if(Config.extrudeEnabled) {
        // create extruded geometry from path Shape:
        this.countries[i].geometry = new THREE.ExtrudeGeometry( this.countries[i].shapes, {
          // amount: Config.extrudeDepth * 10,
          // amount: 0.5 + this.getPopulationRatio(this.countries[i].properties) * 100,
          amount: this.countries[i].numDestinationsFreeOrOnArrival / this.maxNumDestinationsFreeOrOnArrival * 100,
          bevelEnabled: false
        } );
      } else {
        // create flat ShapeGeometry from path Shape:
        this.countries[i].geometry = new THREE.ShapeGeometry( this.countries[i].shapes );
      }


      // subtesselate surface:
      if(Config.tesselationEnabled) {
        var tessellateModifier = new THREE.TessellateModifier( Config.tesselationMaxEdgeLength ); // 2
        for( var n = 0; n < Config.tesselationIterations; n++ ) { // 10
          tessellateModifier.modify( this.countries[i].geometry );
        }
      }

      // 2D Geometry:
      var k;
      this.countries[i].geometry2D = this.countries[i].geometry.clone();
      for(k = 0; k < this.countries[i].geometry2D.vertices.length; k++) {
        this.countries[i].geometry2D.vertices[k].x += Config.mapOffsetX;
        this.countries[i].geometry2D.vertices[k].y = -this.countries[i].geometry2D.vertices[k].y + Config.mapOffsetY;
        // this.countries[i].geometry2D.vertices[k].z += 0;
      }

      this.trianglesNumTotal += this.countries[i].geometry.faces.length;

      // 2D points meshes
      this.countries[i].pointsMesh2D = new THREE.Object3D();
      this.countries[i].center2D = new THREE.Vector3();
      var vertexCount = 0;
      for(var s = 0; s < this.countries[i].shapes.length; s++) {
        var pointsGeometry = this.countries[i].shapes[s].createPointsGeometry();
        for(k = 0; k < pointsGeometry.vertices.length; k++) {
          pointsGeometry.vertices[k].x += Config.mapOffsetX;
          pointsGeometry.vertices[k].y = -pointsGeometry.vertices[k].y + Config.mapOffsetY;
          pointsGeometry.vertices[k].z += 0.2;

          this.countries[i].center2D.add(pointsGeometry.vertices[k]);
          vertexCount++;
        }
        var line = new THREE.Line( pointsGeometry, Config.materialCountryBorder );
        this.countries[i].pointsMesh2D.add(line);
      }
      this.countries[i].center2D.divideScalar(vertexCount);

      CountryDataHelpers.correctCenter(this.countries[i]);

      // 3D Geometry:
      this.countries[i].geometry3D = this.countries[i].geometry.clone();
      for(k = 0; k < this.countries[i].geometry.vertices.length; k++) {
        var spherical = this.geo.projection.invert([this.countries[i].geometry.vertices[k].x, this.countries[i].geometry.vertices[k].y]);
        spherical[0] = THREE.Math.degToRad(spherical[0]);
        spherical[1] = THREE.Math.degToRad(spherical[1]);

        // this.countries[i].geometry3D.vertices[k].x = Config.globeRadius * Math.cos(spherical[0]) * Math.cos(spherical[1]);
        // this.countries[i].geometry3D.vertices[k].y = - Config.globeRadius * Math.sin(spherical[1]);
        // this.countries[i].geometry3D.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);

        this.countries[i].geometry3D.vertices[k].x = Config.globeRadius * Math.cos(spherical[0]) * Math.cos(spherical[1]);
        this.countries[i].geometry3D.vertices[k].y = -Config.globeRadius * Math.sin(spherical[1]);
        if(this.countries[i].geometry.vertices[k].z < Config.extrudeDepth) {
          this.countries[i].geometry3D.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);
          // this.countries[i].geometry3D.vertices[k].multiplyScalar(0.5);
        } else {
          this.countries[i].geometry3D.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);
          this.countries[i].geometry3D.vertices[k].multiplyScalar(1.002);
          if(Config.extrudeEnabled) {
            this.countries[i].geometry3D.vertices[k].multiplyScalar( 1 + this.countries[i].numDestinationsFreeOrOnArrival / this.maxNumDestinationsFreeOrOnArrival * 0.5);
          }
        }
      }
      // rotate and bake transform into vertices:
      this.countries[i].geometry3D.applyMatrix(m);

      this.countries[i].center3D = new THREE.Vector3();
      vertexCount = 0;
      for(k = 0; k < this.countries[i].geometry3D.vertices.length; k++) {
        this.countries[i].center3D.add(this.countries[i].geometry3D.vertices[k]);
        vertexCount++;
      }
      this.countries[i].center3D.divideScalar(vertexCount);

      // this.countries[i].center3D.copy(this.countries[i].center2D);
      spherical = this.geo.projection.invert([this.countries[i].center2D.x - Config.mapOffsetX, -this.countries[i].center2D.y + Config.mapOffsetY]);
      spherical[0] = THREE.Math.degToRad(spherical[0]);
      spherical[1] = THREE.Math.degToRad(spherical[1]);
      this.countries[i].center3D.x = Config.globeRadius * Math.cos(spherical[0]) * Math.cos(spherical[1]);
      this.countries[i].center3D.y = -Config.globeRadius * Math.sin(spherical[1]);
      this.countries[i].center3D.z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);
      this.countries[i].center3D.applyMatrix4(m);


      // 3D points meshes
      this.countries[i].pointsMesh3D = new THREE.Object3D();
      for(s = 0; s < this.countries[i].shapes.length; s++) {
        pointsGeometry = this.countries[i].shapes[s].createPointsGeometry();
        for(k = 0; k < pointsGeometry.vertices.length; k++) {
          spherical = this.geo.projection.invert([pointsGeometry.vertices[k].x, pointsGeometry.vertices[k].y]);

          spherical[0] = THREE.Math.degToRad(spherical[0]);
          spherical[1] = THREE.Math.degToRad(spherical[1]);

          pointsGeometry.vertices[k].x = Config.globeRadius * Math.cos(spherical[0]) * Math.cos(spherical[1]);
          pointsGeometry.vertices[k].y = -Config.globeRadius * Math.sin(spherical[1]);
          pointsGeometry.vertices[k].z = Config.globeRadius * Math.sin(spherical[0]) * Math.cos(spherical[1]);

          pointsGeometry.vertices[k].multiplyScalar(1.004);

        }

        line = new THREE.Line( pointsGeometry, Config.materialCountryBorder );
        this.countries[i].pointsMesh3D.add(line);
      }
      // rotate and bake transform into vertices:
      this.countries[i].pointsMesh3D.applyMatrix(m);


      this.countries[i].mesh = new THREE.Mesh(this.countries[i].geometry, Config.materialCountryDefault); // this.countries[i].material // this.materialCountryDefault
      this.countries[i].mesh.name = this.countries[i].properties.name_long;
      this.countries[i].mesh.countryObject = this.countries[i];
      if(!Config.usesWebGL) {
        this.countries[i].mesh.material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(0xFF0000),
          transparent: false,
          wireframe: false,
          shading: THREE.SmoothShading,
          side: THREE.DoubleSide,
          overdraw: true
        });
      }

      this.countriesObject3D.add(this.countries[i].mesh);

    } // for this.countries.length initial geometry creation end

    if(!Config.usesWebGL) {
      this.scene.add(this.countriesObject3D);
    }

    trace(this.trianglesNumTotal + ' triangles total');

    var scaleStart = 0.0;
    this.countriesObject3D.scale.set(scaleStart, scaleStart, scaleStart);
    this.countriesObject3D.rotation.y = - Math.PI * 6.0;

    this.updateGeometry(true);

    trace('Creating meshes took ' + (Date.now() - start) + ' ms');

    worldMap.updateAllCountryColors();

    worldMap.animationProps.interpolatePos = 1.0;

    if(Config.usesWebGL) {
      worldMap.createBufferGeometry();
      this.updateBufferGeometry();
    }


    window.setTimeout(function() {

      var scaleFinal = 1.0; // has to be one for the picking to work properly in combination with buffer geometry
      worldMap.tweenScale = new TWEEN.Tween(worldMap.countriesObject3D.scale)
        .to({x: scaleFinal, y: scaleFinal, z: scaleFinal}, Config.introRotateDuration) // 3500
        .delay(0)
        .onStart(function() {
          worldMap.animationProps.interpolatePos = 1.0;
        })
        .onUpdate(function() {
          worldMap.geometryNeedsUpdate = true;
        })
        .onComplete(function() {
          // worldMap.controls.enabled = true;
        })
        .easing(TWEEN.Easing.Quadratic.Out)
        // .easing(TWEEN.Easing.Cubic.Out)
        .start();

      worldMap.tweenWarp = new TWEEN.Tween(worldMap.animationProps)
        .to({interpolatePos: 0.0}, Config.introWarpDuration)
        .delay(0)
        .easing(TWEEN.Easing.Exponential.InOut)
        .onUpdate(function() {
          worldMap.geometryNeedsUpdate = true;
        })
        .onComplete(function() {
          worldMap.geometryNeedsUpdate = true;
          worldMap.introRunning = false;

          worldMap.controls.enabled = true;

          UI.initSourceCountryDropDown(worldMap);
          UI.initDestinationCountryDropDown(worldMap);

          if($(window).width() > 480 && IS_DESKTOP) {
            if(!$('#country_list').is(':visible')) {
              UI.updateCountryList(worldMap);
              $('#country_list').slideToggle();
              $('#button_country_list .caret').css('-webkit-transform', 'rotate(180deg)');
            }
          }

          UI.updateModeStatement(worldMap);

          worldMap.uiReady = true;

          if($(window).width() > 861) {
            $('#ce_badge').fadeIn(600);
          }

        });

      window.setTimeout(function() {
        worldMap.tweenWarp.start();
      }, Config.introWarpDelay);

      worldMap.tweenRotation = new TWEEN.Tween(worldMap.countriesObject3D.rotation)
        .to({ y: 0.0 }, Config.introRotateDuration) // 3500
        .delay(0)
        .easing(TWEEN.Easing.Quintic.Out)
        .onUpdate(function() {
          worldMap.geometryNeedsUpdate = true;
        })
        // .easing(TWEEN.Easing.Quintic.Out)
        // TWEEN.Easing.Exponential would cause the map to plop in the end, probably due to a rounding error
        .start();

    }, 100);


  },

  updateGeometry: function(computeFaceNormals) {
    // trace('updateGeometry()');

    var i;
    var k;
    for(i = 0; i < this.countries.length; i++) {
      for(k = 0; k < this.countries[i].geometry.vertices.length; k++) {
        this.countries[i].geometry.vertices[k].copy(this.countries[i].geometry2D.vertices[k]);
        this.countries[i].geometry.vertices[k].mix(this.countries[i].geometry3D.vertices[k], this.animationProps.interpolatePos);
      }
      // this.countries[i].geometry.verticesNeedUpdate = true; // required to update mesh, also for picking to work

      /*
      this.countries[i].geometry.normalsNeedUpdate = true;
      this.countries[i].geometry.uvsNeedUpdate = true;
      this.countries[i].geometry.elementsNeedUpdate = true;
      this.countries[i].geometry.tangentsNeedUpdate = true;
      this.countries[i].geometry.lineDistancesNeedUpdate = true;
      this.countries[i].geometry.colorsNeedUpdate = true;
      this.countries[i].geometry.buffersNeedUpdate = true;
      */

      this.countries[i].geometry.computeBoundingSphere(); // required for picking to work after updating vertices
      if(computeFaceNormals) this.countries[i].geometry.computeFaceNormals(); // required for shading to look correct

    }

    // transform sphere:
    if(this.sphere) {
      for(k = 0; k < this.sphere.geometry.vertices.length; k++) {
        this.sphere.geometry.vertices[k].copy(this.sphereGeometry2D.vertices[k]);
        this.sphere.geometry.vertices[k].mix(this.sphereGeometry3D.vertices[k], this.animationProps.interpolatePos * this.animationProps.interpolatePos);
      }
      this.sphere.geometry.verticesNeedUpdate = true; // required to update mesh

      this.sphere.geometry.computeBoundingSphere(); // required for picking to work after updating vertices
      this.sphere.geometry.computeFaceNormals(); // required for shading to look correct
    }
  },


  createBufferGeometry: function() {
    this.bufferGeometry = new THREE.BufferGeometry();

    var positions = new Float32Array( this.trianglesNumTotal * 3 * 3 );
    var normals = new Float32Array( this.trianglesNumTotal * 3 * 3 );
    var colors = new Float32Array( this.trianglesNumTotal * 3 * 3 );

    var color = new THREE.Color();
    color.set(Config.colorCountryDefault);

    var index = 0;
    var i, f;
    for(i = 0; i < this.countries.length; i++) {
      var vertices = this.countries[i].geometry.vertices;

      for(f = 0; f < this.countries[i].geometry.faces.length; f++) {
        var face = this.countries[i].geometry.faces[f];

        // positions

        positions[ index ] = vertices[ face.a ].x;
        positions[ index + 1 ] = vertices[ face.a ].y;
        positions[ index + 2 ] = vertices[ face.a ].z;

        positions[ index + 3 ] = vertices[ face.b ].x;
        positions[ index + 4 ] = vertices[ face.b ].y;
        positions[ index + 5 ] = vertices[ face.b ].z;

        positions[ index + 6 ] = vertices[ face.c ].x;
        positions[ index + 7 ] = vertices[ face.c ].y;
        positions[ index + 8 ] = vertices[ face.c ].z;

        // normals

        normals[ index ] = face.normal.x;
        normals[ index + 1 ] = face.normal.y;
        normals[ index + 2 ] = face.normal.z;

        normals[ index + 3 ] = face.normal.x;
        normals[ index + 4 ] = face.normal.y;
        normals[ index + 5 ] = face.normal.z;

        normals[ index + 6 ] = face.normal.x;
        normals[ index + 7 ] = face.normal.y;
        normals[ index + 8 ] = face.normal.z;

        // colors

        colors[ index ] = color.r;
        colors[ index + 1 ] = color.g;
        colors[ index + 2 ] = color.b;

        colors[ index + 3 ] = color.r;
        colors[ index + 4 ] = color.g;
        colors[ index + 5 ] = color.b;

        colors[ index + 6 ] = color.r;
        colors[ index + 7 ] = color.g;
        colors[ index + 8 ] = color.b;

        index += 9;

      }
    } // for this.countries.length buffer geometry creation end

    this.bufferGeometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
    this.bufferGeometry.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
    this.bufferGeometry.addAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );

    this.bufferGeometry.verticesNeedUpdate = true;
    this.bufferGeometry.computeBoundingSphere();
    // this.bufferGeometry.computeVertexNormals();

    var mesh = new THREE.Mesh( this.bufferGeometry, Config.materialMap );
    this.scene.add( mesh );

  },

  updateCountryColorsOneByOne: function() {
    // trace('updateCountryColorsOneByOne()');

    if(this.selectedCountry) {
      this.selectedCountry.color.set(Config.colorCountrySelected);
      this.selectedCountry.colorLast.set(this.selectedCountry.color);
    }

    this.animationProps.colorChangeID = 0;
    new TWEEN.Tween({})
      .to({ x: 0 }, Config.updateColorsDuration)
      .onUpdate(function(time) {
        var idLast = worldMap.animationProps.colorChangeID;
        worldMap.animationProps.colorChangeID = parseInt(time * worldMap.countries.length);

        worldMap.updateCountryColors(idLast, worldMap.animationProps.colorChangeID);

        // worldMap.updateBufferGeometry();
        if(Config.usesWebGL) {
          worldMap.updateBufferGeometryColors();
        }
      })
      .start();

  },

  updateAllCountryColors: function(pos) {
    this.updateCountryColors(0, this.countries.length, pos);
  },

  updateCountryColors: function(start, end, pos) {
    // trace('updateCountryColors()');

    // for(var i = 0 ; i < this.countries.length; i++) {
    var c = new THREE.Color();

    for(var i = start; i < end; i++) {
      var country = this.countries[i];

      if(this.mode === 'destinations') {

        if(this.selectedCountry && this.selectedDestinationCountry) {

          if( country === this.selectedDestinationCountry ) {
            if(this.visaInformationFound) {
              c.set( CountryDataHelpers.getCountryColorByVisaStatus(country) );

            } else {
              c.set(Config.colorCountryDefault);
            }

          } else if( country === this.selectedCountry ) {
            c.set(Config.colorCountrySelected);

          } else {
            c.set(Config.colorCountryDefault);
          }

        } else if(this.selectedCountry && !this.selectedDestinationCountry) {

          if( country === this.selectedCountry ) {
            c.set(Config.colorCountrySelected);

          } else {
            if(this.visaInformationFound) {
              c.set( CountryDataHelpers.getCountryColorByVisaStatus(country) );

            } else {
              c.set(Config.colorCountryDefault);
            }

          }

        } else if(!this.selectedCountry && this.selectedDestinationCountry) {

          // like nothing selected:
          if(country.destinations.length > 0) {
            c.set(country.colorByFreeDestinations);
          } else {
            c.set(Config.colorVisaDataNotAvailable);
          }

        } else {

          // nothing selected:
          if(country.destinations.length > 0) {
            c.set(country.colorByFreeDestinations);
          } else {
            c.set(Config.colorVisaDataNotAvailable);
          }

        }

        if( country === this.selectedCountry ) {
          c.set(Config.colorCountrySelected);
        }

      } else if(this.mode === 'sources') {

        if(this.selectedCountry && this.selectedDestinationCountry) {

          if( country === this.selectedDestinationCountry ) {
            if(this.visaInformationFound) {
              c.set( CountryDataHelpers.getCountryColorByVisaStatus(country) );

            } else {
              c.set(Config.colorCountryDefault);
            }

          } else if( country === this.selectedCountry ) {
            c.set(Config.colorCountrySelected);

          } else {
            c.set(Config.colorCountryDefault);
          }

        } else if(this.selectedCountry && !this.selectedDestinationCountry) {

          // like nothing selected:
          c.set(country.colorByFreeSources);

        } else if(!this.selectedCountry && this.selectedDestinationCountry) {

          if( country === this.selectedDestinationCountry ) {
            c.set(Config.colorCountrySelected);

          } else {
            if(this.visaInformationFound) {
              c.set( CountryDataHelpers.getCountryColorByVisaStatus(country) );

            } else {
              c.set(Config.colorCountryDefault);
            }

          }

        } else {

          // nothing selected:
          c.set(country.colorByFreeSources);

        }

      } else if(this.mode === 'gdp') {
        if( country === this.selectedCountry ) {
          c.set(Config.colorCountrySelected);
        } else if(country.properties.gdp_md_est > 100) {
          c.set(country.colorByGDP);
        } else {
          c.set(Config.colorVisaDataNotAvailable);
        }

      } else if(this.mode === 'gdp-per-capita') {
        if( country === this.selectedCountry ) {
          c.set(Config.colorCountrySelected);
        } else if(country.properties.gdp_md_est > 100) {
          c.set(country.colorByGDPPerCapita);
        } else {
          c.set(Config.colorVisaDataNotAvailable);
        }

      } else if(this.mode === 'population') {
        if( country === this.selectedCountry ) {
          c.set(Config.colorCountrySelected);
        } else {
          c.set(country.colorByPopulation);
        }

      }

      if(pos < 1) {
        country.color.set(country.colorLast);
        country.color.lerp(c, pos);
      } else {
        country.color.set(c);
        country.colorLast.set(c);
      }

      if(country.listItem) country.listItem.find('.box').css('background-color', '#' + country.color.getHexString());

      if( !Config.usesWebGL ) {
        country.mesh.material.color = country.color;
      }

    }
  },

  updateBufferGeometry: function() {
    // trace('updateBufferGeometry()');

    var positions = this.bufferGeometry.getAttribute( 'position' ).array;
    var normals = this.bufferGeometry.getAttribute( 'normal' ).array;
    var colors = this.bufferGeometry.getAttribute( 'color' ).array;

    var m = new THREE.Matrix4();
    var m1 = new THREE.Matrix4();
    var m2 = new THREE.Matrix4();
    m1.makeRotationY( this.countriesObject3D.rotation.y );
    m2.makeScale( this.countriesObject3D.scale.x, this.countriesObject3D.scale.y, this.countriesObject3D.scale.z );
    m.multiplyMatrices( m1, m2 );

    var color = new THREE.Color();
    var v = new THREE.Vector3();

    var index = 0;
    var i, f;
    for(i = 0; i < this.countries.length; i++) {
      var vertices = this.countries[i].geometry.vertices;

      // trace( this.countries[i].properties.name_long );
      // trace( this.countries[i].visa_required );

      color.set(this.countries[i].color);

      for(f = 0; f < this.countries[i].geometry.faces.length; f++) {
        var face = this.countries[i].geometry.faces[f];

        // positions

        v.copy( vertices[ face.a ] );
        v.applyMatrix4(m);

        positions[ index ] = v.x;
        positions[ index + 1 ] = v.y;
        positions[ index + 2 ] = v.z;

        v.copy( vertices[ face.b ] );
        v.applyMatrix4(m);

        positions[ index + 3 ] = v.x;
        positions[ index + 4 ] = v.y;
        positions[ index + 5 ] = v.z;

        v.copy( vertices[ face.c ] );
        v.applyMatrix4(m);

        positions[ index + 6 ] = v.x;
        positions[ index + 7 ] = v.y;
        positions[ index + 8 ] = v.z;

        // normals

        normals[ index ] = face.normal.x;
        normals[ index + 1 ] = face.normal.y;
        normals[ index + 2 ] = face.normal.z;

        normals[ index + 3 ] = face.normal.x;
        normals[ index + 4 ] = face.normal.y;
        normals[ index + 5 ] = face.normal.z;

        normals[ index + 6 ] = face.normal.x;
        normals[ index + 7 ] = face.normal.y;
        normals[ index + 8 ] = face.normal.z;

        // colors

        colors[ index ] = color.r;
        colors[ index + 1 ] = color.g;
        colors[ index + 2 ] = color.b;

        colors[ index + 3 ] = color.r;
        colors[ index + 4 ] = color.g;
        colors[ index + 5 ] = color.b;

        colors[ index + 6 ] = color.r;
        colors[ index + 7 ] = color.g;
        colors[ index + 8 ] = color.b;

        index += 9;

      }
    } // for this.countries.length buffer geometry update end

    this.bufferGeometry.attributes.position.needsUpdate = true;
    this.bufferGeometry.attributes.normal.needsUpdate = true;
    this.bufferGeometry.attributes.color.needsUpdate = true;

    // this.bufferGeometry.colorsNeedUpdate = true;
    this.bufferGeometry.computeBoundingSphere();
    // this.bufferGeometry.computeVertexNormals();

  },


  updateBufferGeometryColors: function() {
    // trace('updateBufferGeometryColors()');

    var colors = this.bufferGeometry.getAttribute( 'color' ).array;

    var color = new THREE.Color();

    var index = 0;
    var i, f;
    for(i = 0; i < this.countries.length; i++) {
      color.set(this.countries[i].color);

      for(f = 0; f < this.countries[i].geometry.faces.length; f++) {
        colors[ index ] = color.r;
        colors[ index + 1 ] = color.g;
        colors[ index + 2 ] = color.b;

        colors[ index + 3 ] = color.r;
        colors[ index + 4 ] = color.g;
        colors[ index + 5 ] = color.b;

        colors[ index + 6 ] = color.r;
        colors[ index + 7 ] = color.g;
        colors[ index + 8 ] = color.b;

        index += 9;

      }
    } // for this.countries.length buffer geometry update end

    this.bufferGeometry.attributes.color.needsUpdate = true;

  },

  updateCountryHover: function(country) {
    // trace('updateCountryHover()');
    if(!Config.isTouchDevice) {
      this.intersectedObject = country.mesh;

      if(this.countryBorder) {
        this.scene.remove(this.countryBorder);
      }
      if(this.viewMode === '3d') {
        this.countryBorder = country.pointsMesh3D;
      } else {
        this.countryBorder = country.pointsMesh2D;
      }
      this.scene.add(this.countryBorder);

      if(this.listHover) {
        return;
      }

      UI.updateCountryTooltip(this, country);

    }

  },

  clearCountryHover: function() {
    if(this.countryBorder) {
      this.scene.remove(this.countryBorder);
      this.countryBorder = null;
    }
    this.intersectedObject = null;
  },

  toScreenXY: function(pos3D) {
    var v = pos3D.project( this.camera );
    var percX = (v.x + 1) / 2;
    var percY = (-v.y + 1) / 2;

    var left = percX * window.innerWidth;
    var top = percY * window.innerHeight;

    return new THREE.Vector2(left, top);
  },

  animate: function() {

    if(this.inited) {
      if(!Config.isTouchDevice && !this.introRunning) {
        this.intersectedObjectBefore = this.intersectedObject;

        var intersects = this.getIntersects();

        if( intersects.length > 0 ) {
          // if( this.intersectedObject !== intersects[ 0 ].object && intersects[ 0 ].object.countryObject && intersects[ 0 ].object.countryObject !== this.selectedCountry ) {
          if( this.intersectedObject !== intersects[ 0 ].object && !this.listHover) {
            this.clearCountryHover();

            if(intersects[ 0 ].object.name !== 'sphere') {
              this.intersectedObject = intersects[ 0 ].object;
            }
            var country = intersects[ 0 ].object.countryObject;

            this.updateCountryHover(country);

          }

        } else {
          if(!this.listHover) {
            this.clearCountryHover();
            $('#country-info').stop().fadeOut(100);
          }
        }

        /*
        if(!this.geometryNeedsUpdate && (this.intersectedObjectBefore !== this.intersectedObject) ) {
          this.updateAllCountryColors();
          this.updateBufferGeometry();
        }
        */

        if(this.intersectedObject) {
          $('body').css( 'cursor', 'pointer' );
        } else {
          $('body').css( 'cursor', 'default' );
        }
      }

      if(this.geometryNeedsUpdate) {
        this.updateGeometry(false);
        if(Config.usesWebGL) {
          this.updateBufferGeometry();
        }
      }

      if(this.selectedCountry || this.selectedDestinationCountry) {
        this.updateLines();
      }

      this.render();
    }

  },

  getIntersects: function() {
    var vector = new THREE.Vector3();
    vector.copy(mouseNormalized);
    vector.unproject( this.camera );

    this.raycaster.set( this.camera.position, vector.sub( this.camera.position ).normalize() );

    var intersects = this.raycaster.intersectObjects( this.countriesObject3D.children );
    intersects.sort( function( a, b ) { return a.distance - b.distance; } );

    return intersects;
  },

  getIntersectsMouseDown: function() {
    var vector = new THREE.Vector3();
    vector.copy(mouseNormalizedTouchStart);
    vector.unproject( this.camera );

    this.raycaster.set( this.camera.position, vector.sub( this.camera.position ).normalize() );

    var intersects = this.raycaster.intersectObjects( this.countriesObject3D.children );
    intersects.sort( function( a, b ) { return a.distance - b.distance; } );

    return intersects;
  },

  selectCountryFromMap: function(event) {
    // trace('selectCountryFromMap');

    var intersects = this.getIntersectsMouseDown();

    if( intersects.length > 0 ) {
      if(intersects[ 0 ].object.countryObject && this.selectedCountry !== intersects[ 0 ].object.countryObject ) {

        if(intersects[ 0 ].object.name !== 'sphere') {
          if(this.mode === 'destinations') {
            if(event.ctrlKey || event.altKey || event.metaKey) {
              this.setSelectedDestinationCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('destinationCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            } else {
              this.setSelectedCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('sourceCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            }
          } else if(this.mode === 'sources') {
            if(event.ctrlKey || event.altKey || event.metaKey) {
              this.setSelectedCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('sourceCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            } else {
              this.setSelectedDestinationCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('destinationCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            }

          } else {
            // this.setSelectedCountry(intersects[ 0 ].object.countryObject);
            // this.trackEvent('mapClickSourceCountry', intersects[ 0 ].object.countryObject.properties.name_long);
            if(event.ctrlKey || event.altKey || event.metaKey) {
              this.setSelectedDestinationCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('destinationCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            } else {
              this.setSelectedCountry(intersects[ 0 ].object.countryObject);
              this.trackEvent('sourceCountryMapClick', intersects[ 0 ].object.countryObject.properties.name_long);
            }

          }

          this.updateCountryHover(intersects[ 0 ].object.countryObject);
          UI.centerCountryHoverInfoToMouse();
        }
      }
    } else {
      if(this.mode === 'destinations') {
        if(event.ctrlKey || event.altKey || event.metaKey) {
          this.clearSelectedDestinationCountry();
        } else {
          this.clearBothSelectedCountries();
        }
      } else if(this.mode === 'sources') {
        if(event.ctrlKey || event.altKey || event.metaKey) {
          this.clearSelectedSourceCountry();
        } else {
          this.clearBothSelectedCountries();
        }
      } else {
        if(event.ctrlKey || event.altKey || event.metaKey) {
          this.clearSelectedDestinationCountry();
        } else {
          this.clearBothSelectedCountries();
        }
      }

    }

    this.updateCountryColorsOneByOne();

    // this.updateAllCountryColors();
    // this.updateBufferGeometry();

  },

  clearBothSelectedCountries: function() {
    // trace('clearBothSelectedCountries()');

    if(this.selectedCountry || this.selectedDestinationCountry) {
      this.deleteLinesObject();
      for(var i = 0; i < this.countries.length; i++) {
        this.countries[i].visa_required = '';
        this.countries[i].notes = '';
      }
      if(this.selectedCountry) {
        this.selectedCountry.listItem.removeClass('selected');
      }
      if(this.selectedDestinationCountry) {
        this.selectedDestinationCountry.listItem.removeClass('selected');
      }
      this.selectedCountry = null;
      this.selectedDestinationCountry = null;

      $('#country-info').stop().fadeOut(100);

      $('#country_dropdown').immybox('setValue', '');
      $('#country_dropdown').val(Config.sourceCountryDefaultText);
      $('#country_dropdown').removeClass('filled');
      $('#country_dropdown_container .cancel').fadeOut();

      $('#destination_country_dropdown').immybox('setValue', '');
      $('#destination_country_dropdown').val(Config.destinationCountryDefaultText);
      $('#destination_country_dropdown').removeClass('filled');
      $('#destination_country_dropdown_container .cancel').fadeOut();

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

      UI.updateModeStatement(this);
    }

    UI.updateCountryList(this);

  },

  clearSelectedSourceCountry: function() {
    if(this.selectedCountry) {
      this.deleteLinesObject();
      for(var i = 0; i < this.countries.length; i++) {
        this.countries[i].visa_required = '';
        this.countries[i].notes = '';
      }
      if(this.selectedCountry) {
        this.selectedCountry.listItem.removeClass('selected');
      }
      this.selectedCountry = null;

      UI.updateCountryList(this);

      $('#country-info').stop().fadeOut(100);

      $('#country_dropdown').immybox('setValue', '');
      $('#country_dropdown').val(Config.sourceCountryDefaultText);
      $('#country_dropdown').removeClass('filled');
      $('#country_dropdown_container .cancel').fadeOut();

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

      UI.updateModeStatement(this);
    }
    this.updateCountrySelection();

  },

  clearSelectedDestinationCountry: function() {
    if(this.selectedDestinationCountry) {
      this.deleteLinesObject();
      for(var i = 0; i < this.countries.length; i++) {
        this.countries[i].visa_required = '';
        this.countries[i].notes = '';
      }
      if(this.selectedDestinationCountry) {
        this.selectedDestinationCountry.listItem.removeClass('selected');
      }
      this.selectedDestinationCountry = null;

      UI.updateCountryList(this);

      $('#country-info').stop().fadeOut(100);

      $('#destination_country_dropdown').immybox('setValue', '');
      $('#destination_country_dropdown').val(Config.destinationCountryDefaultText);
      $('#destination_country_dropdown').removeClass('filled');
      $('#destination_country_dropdown_container .cancel').fadeOut();

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

      UI.updateModeStatement(this);
    }
    this.updateCountrySelection();

  },

  getLineMaterial: function(country) {
    var material = Config.materialLineDefault;
    if(country.visa_required === 'no') {
      material = Config.materialLineVisaNotRequired;
    } else if(country.visa_required === 'on-arrival') {
      material = Config.materialLineVisaOnArrival;
    } else if(country.visa_required === 'free-eu') {
      material = Config.materialLineVisaFreeEU;
    } else if(country.visa_required === 'yes') {
      material = Config.materialLineVisaRequired;
    } else if(country.visa_required === 'admission-refused') {
      material = Config.materialLineVisaAdmissionRefused;
    } else if(country.visa_required === '') {
      material = Config.materialLineVisaDataNotAvailable;
    } else { // special
      material = Config.materialLineVisaSpecial;
    }
    return material;
  },

  createLines: function() {
    // trace('createLines()');

    if(this.mode !== 'destinations' && this.mode !== 'sources') {
      return;
    }

    if(this.selectedCountry || this.selectedDestinationCountry) {
      var points2D;
      var points3D;
      var line;
      var c;

      this.deleteLinesObject();

      this.linesObject = new THREE.Object3D();
      this.scene.add(this.linesObject);

      if(this.selectedCountry && this.selectedDestinationCountry) {
        points2D = [];
        points3D = [];

        if(this.mode === 'destinations') {
          points2D.push( this.selectedCountry.center2D );
          points2D.push( this.selectedDestinationCountry.center2D );

          points3D.push( this.selectedCountry.center3D );
          points3D.push( this.selectedDestinationCountry.center3D );
        } else {
          points2D.push( this.selectedDestinationCountry.center2D );
          points2D.push( this.selectedCountry.center2D );

          points3D.push( this.selectedDestinationCountry.center3D );
          points3D.push( this.selectedCountry.center3D );
        }

        this.selectedDestinationCountry.spline2D = new THREE.Spline( points2D );
        this.selectedDestinationCountry.spline3D = new THREE.Spline( points3D );

        this.selectedDestinationCountry.splineLength = points2D[0].distanceTo(points2D[1]);
        this.selectedDestinationCountry.splineHeight = this.selectedDestinationCountry.splineLength * 0.25;
        this.selectedDestinationCountry.geometrySpline = new THREE.Geometry();

        line = new THREE.Line( this.selectedDestinationCountry.geometrySpline, this.getLineMaterial(this.selectedDestinationCountry), THREE.LineStrip );
        this.linesObject.add(line);

      } else if(this.selectedCountry && !this.selectedDestinationCountry) {
        if(this.mode === 'destinations') {
          for(c = 0; c < this.countries.length; c++) {
            if(this.countries[c].visa_required === 'no' || this.countries[c].visa_required === 'on-arrival' || this.countries[c].visa_required === 'free-eu') {
              points2D = [];
              points2D.push( this.selectedCountry.center2D );
              points2D.push( this.countries[c].center2D );
              this.countries[c].spline2D = new THREE.Spline( points2D );

              points3D = [];
              points3D.push( this.selectedCountry.center3D );
              points3D.push( this.countries[c].center3D );
              this.countries[c].spline3D = new THREE.Spline( points3D );

              this.countries[c].splineLength = points2D[0].distanceTo(points2D[1]);
              this.countries[c].splineHeight = this.countries[c].splineLength * 0.25;
              this.countries[c].geometrySpline = new THREE.Geometry();

              line = new THREE.Line( this.countries[c].geometrySpline, this.getLineMaterial(this.countries[c]), THREE.LineStrip );
              this.linesObject.add(line);
            }
          }
        }

      } else if(!this.selectedCountry && this.selectedDestinationCountry) {
        if(this.mode === 'sources') {
          for(c = 0; c < this.countries.length; c++) {
            if(this.countries[c].visa_required === 'no' || this.countries[c].visa_required === 'on-arrival' || this.countries[c].visa_required === 'free-eu') {
              points2D = [];
              points2D.push( this.selectedDestinationCountry.center2D );
              points2D.push( this.countries[c].center2D );
              this.countries[c].spline2D = new THREE.Spline( points2D );

              points3D = [];
              points3D.push( this.selectedDestinationCountry.center3D );
              points3D.push( this.countries[c].center3D );
              this.countries[c].spline3D = new THREE.Spline( points3D );

              this.countries[c].splineLength = points2D[0].distanceTo(points2D[1]);
              this.countries[c].splineHeight = this.countries[c].splineLength * 0.25;
              this.countries[c].geometrySpline = new THREE.Geometry();

              line = new THREE.Line( this.countries[c].geometrySpline, this.getLineMaterial(this.countries[c]), THREE.LineStrip );
              this.linesObject.add(line);
            }
          }
        }
      }

      this.animationProps.lineAnimatePos = 0;
      this.animationProps.lineAnimateOffset = 0;

      this.tweenLines = new TWEEN.Tween(this.animationProps)
        .to({lineAnimatePos: 1}, Config.lineAnimateDuration)
        .onStart(function() {
        })
        .onUpdate(function(time) {
          // worldMap.updateLines(time);
        })
        .easing(TWEEN.Easing.Sinusoidal.Out)
        .start();
    }

  },

  updateLines: function(time) {
    // trace('updateLines()');

    this.animationProps.lineAnimateOffset += Config.lineAnimateSpeed * this.clock.getDelta();
    this.animationProps.lineAnimateOffset %= Config.lineDashOffsetLimit;

    if(this.selectedCountry || this.selectedDestinationCountry) {

      for(var c = 0; c < this.countries.length; c++) {
        var offset = this.animationProps.lineAnimateOffset / this.countries[c].splineLength;

        // if(this.countries[c].visa_required === 'no' || this.countries[c].visa_required === 'on-arrival' || this.countries[c].visa_required === 'free-eu') {
        if(this.countries[c].geometrySpline) {
          var subdivisions = 30;
          for(var i = 0; i < subdivisions; i++) {
            var index;
            index = i / subdivisions * this.animationProps.lineAnimatePos;
            index += offset;
            if(this.mode === 'sources') {
              index = 1 - index;
            }
            index = Math.min(index, 1);
            index = Math.max(index, 0);

            var position2D = this.countries[c].spline2D.getPoint( index );
            var position3D = this.countries[c].spline3D.getPoint( index );

            var z = 0;

            if(index < 0.5) {
              z = TWEEN.Easing.Sinusoidal.Out( index * 2 ) * this.countries[c].splineHeight;
            } else {
              z = TWEEN.Easing.Sinusoidal.Out( 1 - (index - 0.5) * 2 ) * this.countries[c].splineHeight;
            }

            this.countries[c].geometrySpline.vertices[ i ] = new THREE.Vector3( position2D.x, position2D.y, position2D.z );
            this.countries[c].geometrySpline.vertices[ i ].z += z;

            var v3D = new THREE.Vector3( position3D.x, position3D.y, position3D.z );
            v3D.setLength(Config.globeRadius + z);

            this.countries[c].geometrySpline.vertices[ i ].lerp(v3D, this.animationProps.interpolatePos);

          }
          this.countries[c].geometrySpline.verticesNeedUpdate = true;
          this.countries[c].geometrySpline.lineDistancesNeedUpdate = true;
          this.countries[c].geometrySpline.computeLineDistances();
        }
      }
    }
  },

  trackEvent: function(category, action) {
    if(typeof ga !== undefined) {
      ga('send', 'event', category, action);
    }
  },

  setSelectedCountry: function(selectedCountry) {
    // trace('setSelectedCountry()');

    if(!this.introRunning) {
      if(selectedCountry !== this.selectedCountry) {
        this.countrySelectionChanged = true;
      }
      this.selectedCountry = selectedCountry;

      if(this.selectedCountry) {
        this.selectedCountry.listItem.addClass('selected');
        $('#country_dropdown').val( this.selectedCountry.properties.name_long );
        $('#country_dropdown').addClass('filled');
        $('#country_dropdown_container .cancel').fadeIn();
      }

      this.updateCountrySelection();
    }
  },

  setSelectedDestinationCountry: function(selectedDestinationCountry) {
    // trace('setSelectedDestinationCountry()');

    if(!this.introRunning) {
      if(selectedDestinationCountry !== this.selectedDestinationCountry) {
        this.countrySelectionChanged = true;
      }
      this.selectedDestinationCountry = selectedDestinationCountry;

      if(this.selectedDestinationCountry) {
        this.selectedDestinationCountry.listItem.addClass('selected');
        $('#destination_country_dropdown').val( this.selectedDestinationCountry.properties.name_long );
        $('#destination_country_dropdown').addClass('filled');
        $('#destination_country_dropdown_container .cancel').fadeIn();
      }

      this.updateCountrySelection();
    }
  },

  updateCountrySelection: function() {
    // trace('updateCountrySelection()');

    var i;
    var destinations;
    var d;
    var mainCountry;
    var value;
    var html;

    for(i = 0; i < this.countries.length; i++) {
      this.countries[i].visa_required = '';
      this.countries[i].notes = '';
    }

    if(this.mode === 'destinations') {

      if(this.selectedCountry && this.selectedDestinationCountry) {
        this.visaInformationFound = false;

        destinations = this.selectedCountry.destinations;
        if( destinations.length > 0 ) {
          for(d = 0; d < destinations.length; d++) {
            if( (CountryDataHelpers.matchDestinationToCountryName(destinations[d].d_name, this.selectedDestinationCountry.properties.name_long) || CountryDataHelpers.matchDestinationToCountryName(this.selectedDestinationCountry.properties.name_long, destinations[d].d_name)) && this.selectedDestinationCountry.properties.name_long !== this.selectedCountry.properties.name_long) {
              this.selectedDestinationCountry.visa_required = destinations[d].visa_required;
              this.selectedDestinationCountry.notes = destinations[d].notes;

              this.visaInformationFound = true;
              $('#travelscope').html( CountryDataHelpers.getCountryDetailsByVisaStatus(this.selectedDestinationCountry) + ' for nationals from ' + CountryDataHelpers.getCountryNameWithArticle(this.selectedCountry) + ' travelling to ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + '.<br/><div class="notes">' + this.selectedDestinationCountry.notes + '</div>' );

              break;
            }
          }

          // add main sovereignty, if exists:
          mainCountry = CountryDataHelpers.getCountryByName(this.countries, this.selectedCountry.properties.sovereignt);
          if(mainCountry && mainCountry.visa_required === '') {
            mainCountry.visa_required = 'no';
            mainCountry.notes = 'National of same sovereignty (exceptions may exist)';
            this.visaInformationFound = true;
            $('#travelscope').html( CountryDataHelpers.getCountryDetailsByVisaStatus(this.selectedDestinationCountry) + ' for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' travelling to ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + '.<br/><div class="notes">' + this.selectedDestinationCountry.notes + '</div>' );
          }

        } else {
          this.visaInformationFound = false;
          $('#travelscope').html( 'Data not available for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + '. <div class="notes">Please select a different country or click/tap the background to clear selection.</div>' );

        }

      } else if(this.selectedCountry && !this.selectedDestinationCountry) {
        this.selectedCountry.populationReachable = 0;
        destinations = this.selectedCountry.destinations;
        if( destinations.length > 0 ) {
          for(d = 0; d < destinations.length; d++) {
            var found = false;

            for(var c = 0; c < this.countries.length; c++) {
              // if( (CountryDataHelpers.matchDestinationToCountryName(destinations[d].d_name, this.countries[c].properties.name_long) || CountryDataHelpers.matchDestinationToCountryName(this.countries[c].properties.name_long, destinations[d].d_name)) && this.countries[c].properties.name_long !== this.selectedCountry.properties.name_long) {
              if(
                // ( destinations[d].d_name === this.countries[c].properties.sovereignt) ||
                (
                   CountryDataHelpers.matchDestinationToCountryName(destinations[d].d_name, this.countries[c].properties.name_long) ||
                   CountryDataHelpers.matchDestinationToCountryName(this.countries[c].properties.name_long, destinations[d].d_name)
                ) &&
                  this.countries[c].properties.name_long !== this.selectedCountry.properties.name_long

                ) {
                this.countries[c].visa_required = destinations[d].visa_required;
                this.countries[c].notes = destinations[d].notes;

                if(destinations[d].visa_required === 'no' || destinations[d].visa_required === 'on-arrival' || destinations[d].visa_required === 'free-eu') {
                  this.selectedCountry.populationReachable += this.countries[c].properties.pop_est;
                }

                found = true;
                break;
              }

            }
            if(!found) {
              // trace('ERROR: ' + destinations[d].d_name + ' could not be matched');
            }
          }

          // add main sovereignty, if exists:
          mainCountry = CountryDataHelpers.getCountryByName(this.countries, this.selectedCountry.properties.sovereignt);
          if(mainCountry && mainCountry.visa_required === '') {
            mainCountry.visa_required = 'no';
            mainCountry.notes = 'National of same sovereignty (exceptions may exist)';
            this.selectedCountry.populationReachable += mainCountry.properties.pop_est;
          }

          this.selectedCountry.populationPercentage = Math.round( this.selectedCountry.populationReachable / this.totalPopulation * 100 * 10 ) / 10;
          this.selectedCountry.populationPercentage = formatNumber(this.selectedCountry.populationPercentage, 1);

          this.visaInformationFound = true;

          $('#travelscope').html( 'Nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' can to travel to <b>' + this.selectedCountry.numDestinationsFreeOrOnArrival + ' countries</b> (' + this.selectedCountry.populationPercentage + '&nbsp;% of the global population) without a visa or with visa on arrival.');
          $('#legend_selected').fadeIn();
          $('#legend_main').fadeOut();

        } else {
          this.visaInformationFound = false;

          $('#travelscope').html( 'Data not available for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + '. <div class="notes">Please select a different country or click/tap the background to clear selection.</div>' );
          $('#legend_selected').fadeOut();
          $('#legend_main').fadeIn();

          // trace('No visa information found for national from ' + this.selectedCountry.properties.name + '');
        }

      } else if(!this.selectedCountry && this.selectedDestinationCountry) {

      } else {
        // nothing selected
      }

    } else if(this.mode === 'sources') {

      if(this.selectedCountry && this.selectedDestinationCountry) {
        this.visaInformationFound = false;

        destinations = this.selectedCountry.destinations;
        if( destinations.length > 0 ) {
          for(d = 0; d < destinations.length; d++) {
            if( (CountryDataHelpers.matchDestinationToCountryName(destinations[d].d_name, this.selectedDestinationCountry.properties.name_long) || CountryDataHelpers.matchDestinationToCountryName(this.selectedDestinationCountry.properties.name_long, destinations[d].d_name)) && this.selectedDestinationCountry.properties.name_long !== this.selectedCountry.properties.name_long) {
              this.selectedDestinationCountry.visa_required = destinations[d].visa_required;
              this.selectedDestinationCountry.notes = destinations[d].notes;

              this.visaInformationFound = true;
              $('#travelscope').html( CountryDataHelpers.getCountryDetailsByVisaStatus(this.selectedDestinationCountry) + ' for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' travelling to ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + '.<br/><div class="notes">' + this.selectedDestinationCountry.notes + '</div>' );

              break;
            }
          }

          // check, if selected destination country has the same sovereignty
          if(this.selectedCountry.properties.sovereignt === this.selectedDestinationCountry.properties.sovereignt) {
            this.selectedDestinationCountry.visa_required = 'no';
            this.selectedDestinationCountry.notes = 'National of same sovereignty (exceptions may exist)';
            this.visaInformationFound = true;
            $('#travelscope').html( CountryDataHelpers.getCountryDetailsByVisaStatus(this.selectedDestinationCountry) + ' for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' travelling to ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + '.<br/><div class="notes">' + this.selectedDestinationCountry.notes + '</div>' );
          }

        } else {
          this.visaInformationFound = false;
          $('#travelscope').html( 'Data not available for nationals from ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + '. <div class="notes">Please select a different country or click/tap the background to clear selection.</div>' );

        }

      } else if(this.selectedCountry && !this.selectedDestinationCountry) {

      } else if(!this.selectedCountry && this.selectedDestinationCountry) {

        this.selectedDestinationCountry.populationAccepted = 0;

        for(i = 0; i < this.countries.length; i++) {
          destinations = this.countries[i].destinations;
          for(d = 0; d < destinations.length; d++) {
            if( CountryDataHelpers.matchDestinationToCountryName(destinations[d].d_name, this.selectedDestinationCountry.properties.name_long) || CountryDataHelpers.matchDestinationToCountryName(this.selectedDestinationCountry.properties.name_long, destinations[d].d_name) ) {
              this.countries[i].visa_required = destinations[d].visa_required;
              this.countries[i].notes = destinations[d].notes;

              if(destinations[d].visa_required === 'no' || destinations[d].visa_required === 'on-arrival' || destinations[d].visa_required === 'free-eu') {
                this.selectedDestinationCountry.populationAccepted += this.countries[i].properties.pop_est;
              }
            }
          }
        }
        this.visaInformationFound = true;

        // add all countries width same sovereignty like destination country:
        var countries = CountryDataHelpers.getAllCountriesWithSameSovereignty(this.countries, this.selectedDestinationCountry.properties.sovereignt);
        for(i = 0; i < countries.length; i++) {
          if(countries[i].visa_required === '') {
            countries[i].visa_required = 'no';
            countries[i].notes = 'National of same sovereignty (exceptions may exist)';
            this.selectedDestinationCountry.populationAccepted += countries[i].properties.pop_est;
          }
        }

        var populationPercentage = Math.round( this.selectedDestinationCountry.populationAccepted / this.totalPopulation * 100 * 10 ) / 10;
        populationPercentage = formatNumber(populationPercentage, 1);

        $('#travelscope').html( toSentenceStart( CountryDataHelpers.getCountryNameWithArticle(this.selectedDestinationCountry) ) + ' grants nationals from <b>' + this.selectedDestinationCountry.numSourcesFreeOrOnArrival + ' countries</b> (' + populationPercentage + '&nbsp;% of the global population) access visa-free or with visa on arrival.');
        $('#legend_selected').fadeIn();
        $('#legend_main').fadeOut();

      } else {
        // nothing selected
      }

    } else if(this.mode === 'gdp') {
      html = '';
      if(this.selectedCountry) {
        if(this.selectedCountry.properties.gdp_md_est > 100) {
          value = this.selectedCountry.properties.gdp_md_est / 1000;
          value = formatNumber(value, 1) + ' Billion USD';
          html += 'GDP of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ': ' + value + '<br/>';
        } else {
          html += 'Data for ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' not available<br/>';
        }
      }
      if(this.selectedDestinationCountry) {
        if(this.selectedDestinationCountry.properties.gdp_md_est > 100) {
          value = this.selectedDestinationCountry.properties.gdp_md_est / 1000;
          value = formatNumber(value, 1) + ' Billion USD';
          html += 'GDP of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + ': ' + value + '<br/>';
        } else {
          html += 'Data for ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + ' not available<br/>';
        }
      }
      $('#travelscope').html(html);

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

    } else if(this.mode === 'gdp-per-capita') {
      html = '';
      if(this.selectedCountry) {
        if(this.selectedCountry.properties.gdp_md_est > 100) {
          value = Math.round(this.selectedCountry.properties.gdp_md_est / this.selectedCountry.properties.pop_est * 1000000);
          html += 'GDP per capita of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ': ' + formatNumber(value, 0) + ' USD<br/>';
        } else {
          html += 'Data for ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ' not available<br/>';
        }
      }
      if(this.selectedDestinationCountry) {
        if(this.selectedDestinationCountry.properties.gdp_md_est > 100) {
          value = Math.round(this.selectedDestinationCountry.properties.gdp_md_est / this.selectedDestinationCountry.properties.pop_est * 1000000);
          html += 'GDP per capita of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + ': ' + formatNumber(value, 0) + ' USD<br/>';
        } else {
          html += 'Data for ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + ' not available<br/>';
        }
      }
      $('#travelscope').html(html);

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

    } else if(this.mode === 'population') {
      html = '';
      if(this.selectedCountry) {
        value = this.selectedCountry.properties.pop_est;
        value = formatNumber(value, 0);
        html += 'Population of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedCountry ) + ': ' + value + '<br/>';
      }
      if(this.selectedDestinationCountry) {
        value = this.selectedDestinationCountry.properties.pop_est;
        value = formatNumber(value, 0);
        html += 'Population of ' + CountryDataHelpers.getCountryNameWithArticle( this.selectedDestinationCountry ) + ': ' + value + '<br/>';
      }
      $('#travelscope').html(html);

      $('#legend_selected').fadeOut();
      $('#legend_main').fadeIn();

    }

    UI.updateCountryList(this);
    if(Config.usesWebGL) {
      this.createLines();
    }
    this.updateCountryColorsOneByOne();

  },

  deleteLinesObject: function() {
    // trace('deleteLinesObject()');

    if(this.linesObject) {
      this.scene.remove(this.linesObject);
      this.linesObject = null;
    }
  },

  render: function() {

    this.renderer.render(this.scene, this.camera);

    if(this.controls) {
      this.controls.update();
    }

    /*
    this.pointLight.position.x = this.camera.position.x;
    this.pointLight.position.y = this.camera.position.y + 300;
    this.pointLight.position.z = this.camera.position.z;
    */

  }
}; /* WorldMap end */


function init() {
  if(Config.statsVisible) {
    stats = new Stats();
    stats.domElement.style.position = 'fixed';
    stats.domElement.style.top = '150px';
    stats.domElement.style.right = '0px';
    $('body').append( stats.domElement );
  }

  container = $('#container');

  /*
  // add GUI
  var gui = new dat.GUI();
  gui.add(worldMap.animationProps, 'interpolatePos', 0.0, 1.0).listen().onChange(function() {
    worldMap.updateGeometry(false);
    worldMap.updateBufferGeometry();
  });
  gui.add(worldMap.animationProps, 'globeRotationX', -Math.PI, Math.PI).onChange(function() {
    worldMap.updateGeometry(false);
    worldMap.updateBufferGeometry();
  });
  gui.add(worldMap.animationProps, 'globeRotationY', -Math.PI, Math.PI).onChange(function() {
    worldMap.updateGeometry(false);
    worldMap.updateBufferGeometry();
  });
  gui.add(worldMap.animationProps, 'sphereVisible').onChange(function() {
    worldMap.sphere.visible = Config.sphereVisible;
  });
  */

  Panels.initPanels();

  window.addEventListener('resize', onWindowResize, false);
  onWindowResize();

  UI.centerCountryHoverInfoToScreen();

  worldMap = new WorldMap();

  UI.createLoadingInfo();

  trace('Loading Visa requirements ...');

  $.when( $.getJSON(Config.visaRequirementsFile) ).then(function(dataRequirements) {
    trace('Visa requirements loaded.');
    // trace( 'JSON Data: ' + dataRequirements.countries['Germany'].code );
    worldMap.visaRequirements = dataRequirements;
    worldMap.initD3();
    worldMap.initThree();

    if(Config.sphereEnabled) {
      worldMap.createSphere();
    }

    // trace('Loading world map ...');
    $('#loading .details').html('Loading world map ...');

    $.when( $.getJSON(Config.mapDataFile) ).then(function(dataCountries) {
      // trace('World map loaded.');
      worldMap.dataCountries = dataCountries;

      /*
      // check for duplicate sovereignties:
      var count = 0;
      var features = dataCountries.features;
      worldMap.dataCountries.features = [];
      for(var i = 0 ; i < features.length; i++) {
        var feature2 = features[i];

        var found = false;
        for(var j = 0 ; j < worldMap.dataCountries.features.length ; j++) {
          var feature = worldMap.dataCountries.features[j];
          if( feature.properties.sovereignt === feature2.properties.sovereignt ) {
            found = true;
            break;
          }
        }
        if(!found) {
          worldMap.dataCountries.features.push(feature2);
          // trace('Adding country: ' + feature2.properties.name_long);
        } else {
          trace('Duplicate country: ' + feature2.properties.name_long + ', sovereignty: ' + feature2.properties.sovereignt);
          count++;
        }
      }
      trace(count);
      */

      if(Config.mergeDataFromMapDataFile2) {
        $.when( $.getJSON(Config.mapDataFile2) ).then(function(dataCountries2) {
          worldMap.dataCountries2 = dataCountries2;

          // merge countries from second higher-res map into first instead of loading full highres map:
          for(var i = 0; i < worldMap.dataCountries2.features.length; i++) {
            var feature2 = worldMap.dataCountries2.features[i];

            var found = false;
            for(var j = 0; j < worldMap.dataCountries.features.length; j++) {
              var feature = worldMap.dataCountries.features[j];
              if( feature.properties.name === feature2.properties.name ) {
                found = true;
                break;
              }
            }
            if(!found) {
              worldMap.dataCountries.features.push(feature2);
              trace('Adding country: ' + feature2.properties.name);
            }
          }

          if(Config.saveMapData) {
            var jsonPretty = JSON.stringify(worldMap.dataCountries, null, '');
            $.ajax({
              type: 'POST',
              url: 'php/save_country_data.php',
              data: {mergedCountriesFilename: Config.mergedCountriesFilename, json: jsonPretty},
              success: function() {
                trace('JSON map data sent');
              }
            }).done(function( msg ) {
              trace( 'Response: ' + msg );
            });
          }

          completeInit();

        });

      } else {
        completeInit();
      }

    });
  });

  function animate() {
    requestAnimationFrame(animate);

    if(worldMap !== undefined) worldMap.geometryNeedsUpdate = false;

    if(stats !== undefined) stats.update();

    TWEEN.update();

    if(worldMap !== undefined) worldMap.animate();
  }
  animate();

} /* init() end */


function completeInit() {
  worldMap.createCountries();
  worldMap.initControls();
  worldMap.initUI();

  // container.bind('click', onMouseClick);
  container.single_double_click(onMouseClick, onMouseDoubleClick);

  container.bind('mousedown', onMouseDown);
  container.bind('mousemove', onMouseMove);
  container.bind('mouseup', onMouseUp);
  container.bind('mousewheel', onMouseWheel);
  container.bind('DOMMouseScroll', onMouseWheel); // firefox

  container.bind('touchstart', onTouchStart);
  container.bind('touchmove', onTouchMove);
  // container.bind('touchend', onTouchEnd);

  container.single_double_tap(onTouchEnd, onDoubleTap);

  onWindowResize();

  $('#loading .details').html('Done.');
  // $('#loading').delay(0).fadeOut(1000);
  $({s: 1}).stop().delay(0).animate({s: 0}, {
    duration: 800,
    easing: 'easeOutCubic',
    step: function() {
      var t = 'scale(' + this.s + ', ' + this.s + ')';
      $('#loading').css('-webkit-transform', t);
      $('#loading').css('-moz-transform', t);
      $('#loading').css('-ms-transform', t);
    },
    complete: function() {
      $('#loading').hide();
    }
  });

}

function onMouseDown(event) {
  // trace('onMouseDown()');

  isMouseDown = true;

  mouseNormalizedTouchStart.copy(mouseNormalized);
  selectCountryOnTouchEnd = true;

}

function onMouseMove(event) {
  // trace('onMouseMove()');

  event.preventDefault();

  UI.mouse.x = event.clientX;
  UI.mouse.y = event.clientY;

  mouseNormalized.x = ( event.clientX / viewportWidth ) * 2 - 1;
  mouseNormalized.y = -( event.clientY / viewportHeight ) * 2 + 1;

  if(isMouseDown) {
    selectCountryOnTouchEnd = mouseNormalized.distanceTo(mouseNormalizedTouchStart) < 0.005;
  }

  if(!worldMap.listHover) {
    UI.centerCountryHoverInfoToMouse();
  }

}

function onMouseUp(event) {
  isMouseDown = false;
}

function onMouseClick(event) {
  // trace('onMouseClick()');

  $('#country_dropdown').blur();
  $('#destination_country_dropdown').blur();
  $('#slider_zoom .ui-slider-handle').blur();

  if(selectCountryOnTouchEnd) {
    worldMap.selectCountryFromMap(event);
  }

}

function onMouseDoubleClick(event) {
  // trace('onMouseDoubleClick()');
}

function onMouseWheel(event) {
  UI.updateZoomSlider(worldMap);
}

function onTouchStart(event) {
  // trace('onTouchStart');
  event.preventDefault();

  var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
  mouseNormalized.x = ( touch.pageX / viewportWidth ) * 2 - 1;
  mouseNormalized.y = -( touch.pageY / viewportHeight ) * 2 + 1;

  mouseNormalizedTouchStart.copy(mouseNormalized);

  selectCountryOnTouchEnd = true;

}

function onTouchMove(event) {
  // trace('onTouchMove');
  event.preventDefault();

  var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];

  UI.mouse.x = touch.pageX;
  UI.mouse.y = touch.pageY;

  mouseNormalized.x = ( touch.pageX / viewportWidth ) * 2 - 1;
  mouseNormalized.y = -( touch.pageY / viewportHeight ) * 2 + 1;

  if(mouseNormalized.distanceTo(mouseNormalizedTouchStart) > 0.03) {
    selectCountryOnTouchEnd = false;
  }

}

function onTouchEnd(event) {
  // trace('onTouchEnd');
  event.preventDefault();

  var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
  mouseNormalized.x = ( touch.pageX / viewportWidth ) * 2 - 1;
  mouseNormalized.y = -( touch.pageY / viewportHeight ) * 2 + 1;

  if(selectCountryOnTouchEnd) {
    worldMap.selectCountryFromMap(event);
  }

}

function onDoubleTap(event) {
  // trace('onDoubleTap()');
}


function onWindowResize() {
  // trace('onWindowResize()');

  // $('#trace').css('height', ($(window).height() - 200) + 'px');

  viewportWidth = $(window).width();
  viewportHeight = $(window).height();

  container.css('width', viewportWidth + 'px');
  container.css('height', viewportHeight + 'px');

  $('#slider_zoom').css('left', (viewportWidth - $('#slider_zoom').width()) / 2 + 'px');

  if(worldMap) {
    worldMap.renderer.setSize( viewportWidth, viewportHeight );

    if(Config.usesWebGL) {
      worldMap.renderer.setViewport(0, 0, viewportWidth, viewportHeight);
    }
    worldMap.camera.aspect = viewportWidth / viewportHeight;
    worldMap.camera.updateProjectionMatrix();

    if(worldMap.controls) {
      worldMap.controls.screen.width = viewportWidth;
      worldMap.controls.handleResize();
    }

    if(worldMap.inited && !worldMap.introRunning) {
      if($(window).width() > 480) {
        $('#button_country_list').show();
      } else {
        $('#button_country_list').hide();
        $('#country_list').hide();
      }
    }

    worldMap.render();

    if(worldMap.uiReady) {
      if($(window).width() > 861) {
        $('#ce_badge').stop().fadeIn(600);
      } else {
        $('#ce_badge').stop().fadeOut(600);
      }
    }
  }

  UI.centerCountryHoverInfoToScreen();
  UI.centerLoadingPanelToScreen();

  Panels.centerPanelToScreen();

}


$(document).ready(function() {

  Trace.init({ showLineNumbers: true });
  if(!Config.traceVisible) {
    Trace.div.css('display', 'none');
  }

  init();

});


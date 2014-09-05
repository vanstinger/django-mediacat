 "use strict";

var Fluxxor = require('fluxxor');
var Immutable = require('immutable');
var request = require('superagent');

var Constants = require('../constants');
var matrix = require('matrix-utilities')
var uuid = require('uuid-v4');


var getScaleMatrix = function(scale) {
  return [
    [scale, 0, 0], 
    [0, scale, 0], 
    [0, 0, 1]];
};

var getTranslateMatrix = function(x, y) {
  return [
    [1, 0, x], 
    [0, 1, y], 
    [0, 0, 1]]
  ;
};

var matrixFromValues = function(v) {
  return [
    [v.x1, v.x2],
    [v.y1, v.y2],
    [1, 1]
  ];
};

var valuesFromMatrix = function(m) {
  return {
    x1: m[0][0],
    x2: m[0][1],
    y1: m[1][0],
    y2: m[1][1]
  };
};

var scaleCoordinates = function(values, scale, x, y) {
  var m = matrixFromValues(values);
  var preTranslateMatrix = getTranslateMatrix(-x, -y);
  var scaleMatrix = getScaleMatrix(scale);
  var postTranslateMatrix = getTranslateMatrix(x, y);  

  m = matrix.multiply(preTranslateMatrix, m);
  m = matrix.multiply(scaleMatrix, m);
  m = matrix.multiply(postTranslateMatrix, m);

  return valuesFromMatrix(m);
};

var translateCoordinates = function(values, dX, dY) {
  var m = matrixFromValues(values);
  var translateMatrix = getTranslateMatrix(dX, dY);  
  m = matrix.multiply(translateMatrix, m);
  return valuesFromMatrix(m);
};

var getCropOverflow = function(media, anchorX, anchorY, values) {
  // Sometimes we scale too far, so work out the scale necessary to fix it.
  var x1 = values.x1 < 0 ? -values.x1 / (anchorX - values.x1) : 0;
  var y1 = values.y1 < 0 ? -values.y1 / (anchorY - values.y1): 0;
  var x2 = values.x2 > media.get('width') ? (values.x2 - media.get('width')) / (values.x2 - anchorX) : 0;
  var y2 = values.y2 > media.get('height') ? (values.y2 - media.get('height')) / (values.y2 - anchorY) : 0;

  return {x1, y1, x2, y2, reverseScale: 1 - Math.max(x1, y1, x2, y2)};
};


var CropStore = Fluxxor.createStore({
  actions: {
    CATEGORY_SELECTED: 'onCategorySelect',
    MEDIA_SELECTED: 'onMediaSelect',
    CROP_SELECTED: 'onCropSelect',
    CROP_DESELECTED: 'onCropDeselect',
    CROP_MOVE: 'onCropMove',
    CROP_RESIZE: 'onCropResize',
    CROP_ADD: 'onCropAdd',
    FETCH_CROPS_SUCCESS: 'onFetchCropsSuccess',    
  },

  initialize: function(options) {
    this.setMaxListeners(0);
    this.state = Immutable.fromJS(options);
  },

  getFetchRequest: function(media, filters) {
    var query = {
      image_id: media.get('id')
    };

    var onSuccess = function(response) {
      this.flux.actions.crops.fetchSuccess(response, media.get('id'));
    }.bind(this);

    return request
      .get('/mediacat/crops/')
      .query(query)
      .set('Accept', 'application/json')
      .on('error', this.flux.actions.crops.fetchError)
      .end(onSuccess);
  },

  getSelectedCrop: function() {
    var mediaId = this.flux.stores['Media'].state.get('selectedMedia');
    var id = this.state.get('selectedCrop');

    if (!mediaId || !id) {
      return null;
    }
    return this.state.getIn(['crops', mediaId]).find(c => c.get('id') === id);
  },

  onFetchImagesSuccess: function(payload) {
    var categoryPath = payload.categoryPath;

    var req = payload.request;
    var media = Immutable.fromJS(payload.data);

    var requests = this.state.get('fetchRequests');
    var key = requests.findKey((v, k) => v === req);
    requests = requests.delete(key);    
    this.state = this.state.set('fetchRequests', requests);

    if (payload.categoryPath === this.flux.stores['Categories'].state.get('selectedPath')) {
      this.state = this.state.set('media', media);
    }
    this.emit('change');
  },

  onCropSelect: function(payload) {
    this.state = this.state.set('selectedCrop', payload.crop.get('id'));
    this.emit('change');    
  },

  onCropDeselect: function(payload) {
    this.state = this.state.set('selectedCrop', null);
    this.emit('change');    
  },

  onCropResize: function(payload) {
    var crop = payload.crop;
    var media = payload.media;
    var cropIndex = this.state.getIn(['crops', media.get('id')]).indexOf(crop);

    var cropData = crop.toJS();

    var width = media.get('width');
    var height = media.get('height');

    var cropWidth = cropData.x2 - cropData.x1;
    var cropHeight = cropData.y2 - cropData.y1;

    var dX = payload.dX;
    var dY = payload.dY;

    var scale;

    // What point do we anchor around, and how should we multiply the X and Y deltas;
    var anchor = {
      'center': [['x1', 'x2'], ['y1', 'y2'], 1, 1],
      'left': [['x2', 'x2'], ['y1', 'y2'], -1, 0],
      'right': [['x1', 'x1'], ['y1', 'y2'], 1, 0],
      'bottom': [['x1', 'x2'], ['y1', 'y1'], 0, 1],
      'top': [['x1', 'x2'], ['y2', 'y2'], 0, -1],      
      'top-left': [['x2', 'x2'], ['y2', 'y2'], -1, -1],
      'top-right': [['x1', 'x1'], ['y2', 'y2'], 1, -1],
      'bottom-left': [['x2', 'x2'], ['y1', 'y1'], -1, 1],
      'bottom-right': [['x1', 'x1'], ['y1', 'y1'], 1, 1]
    }[payload.position];        

    if (Math.abs(dX) >= Math.abs(dY)) {
      scale = (cropWidth + (anchor[2] * dX)) / cropWidth;
    } else {
      scale = (cropHeight + (anchor[3] * dY)) / cropHeight;
    }

    var x = (cropData[anchor[0][0]] + cropData[anchor[0][1]]) / 2;
    var y = (cropData[anchor[1][0]] + cropData[anchor[1][1]]) / 2;  
    var transformedData = scaleCoordinates(cropData, scale, x, y);

    x = (transformedData[anchor[0][0]] + transformedData[anchor[0][1]]) / 2;
    y = (transformedData[anchor[1][0]] + transformedData[anchor[1][1]]) / 2;
    var overflow = getCropOverflow(media, x, y, transformedData);

    if (overflow.reverseScale !== 1) {
      transformedData = scaleCoordinates(transformedData, overflow.reverseScale, x, y);
    }

    this.updateCrop(cropIndex, crop, media, transformedData);
  },

  onCropMove: function(payload) {
    var crop = payload.crop;
    var media = payload.media;
    var cropIndex = this.state.getIn(['crops', media.get('id')]).indexOf(crop);
    var transformedData = translateCoordinates(crop.toJS(), payload.dX, payload.dY);

    var dX = 0;
    var dY = 0;

    if (transformedData.x1 < 0) {
      dX = -transformedData.x1;
    } else if (transformedData.x2 > media.get('width')) {
      dX = media.get('width') - transformedData.x2;
    }

    if (transformedData.y1 < 0) {
      dY = -transformedData.y1;
    } else if (transformedData.y2 > media.get('height')) {
      dY = media.get('height') - transformedData.y2;
    }

    if (dX || dY) {
      transformedData = translateCoordinates(transformedData, dX, dY);
    }

    this.updateCrop(cropIndex, crop, media, transformedData);
  },

  updateCrop: function(index, crop, media, data) {
    var values = {
      x1: Math.round(data.x1),
      x2: Math.round(data.x2),
      y1: Math.round(data.y1),
      y2: Math.round(data.y2)
    };

    this.state = this.state.updateIn(['crops', media.get('id'), index], function(crop) {
      for (var k in values) {
        crop = crop.set(k, Math.round(values[k]));
      }
      return crop;
    }); 
    this.emit('change');
  },

  onCropAdd: function(payload) {
    var cropType = payload.cropType;
    var media = payload.media;

    var width = media.get('width');
    var height = media.get('height');
    var ratio = width / height;

    var cropRatio = this.state.getIn(['availableCrops', cropType, 1]);
    var cropWidth;
    var cropHeight;

    var x1;
    var x2;
    var y1;
    var y2;

    if (cropRatio >= ratio) {
      // Touch the left and right
      cropWidth = width;

      x1 = 0;
      x2 = cropWidth;

      cropHeight = cropWidth / cropRatio;

      y1 = Math.round((height - cropHeight) / 2);
      y2 = height - y1;

    } else {
      cropHeight = height;

      y1 = 0;
      y2 = cropHeight;

      cropWidth = cropHeight * cropRatio;

      x1 = Math.round((width - cropWidth) / 2);
      x2 = width - x1;
    }

    var newCrop = Immutable.fromJS({
      applications: [],
      height: cropHeight,
      id: uuid(), // This doesn't get saved, it's just so that React has a key
      key: cropType,
      ratio: cropRatio,
      x1: x1,
      x2: x2,
      y1: y1,
      y2: y2
    });

    this.state = this.state.updateIn(['crops', media.get('id')], crops => crops.push(newCrop));
    this.emit('change');
  },

  onMediaSelect: function(payload) {
    var id = payload.media.get('id');

    if (!this.state.getIn(['crops', id])) {
      this.state = this.state.updateIn(['crops'], groups => groups.set(id, payload.media.get('crops')));
      this.emit('change');
    }
  },

  onCategorySelect: function(payload) {
    this.state = this.state.set('selectedCrop', null);    
    this.emit('change');
  }
});

module.exports = CropStore;
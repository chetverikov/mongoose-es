'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var Elastic = require('elasticsearch')
  , Collector = require('./collector')
  , events = require('events')
  , _ = require('lodash')
  , noop = function(doc) {
    var data = doc.toObject();
    delete data._id;
    return data;
  };

module.exports = MongooseES;

function MongooseES(schema, options) {
  this.schema = schema;

  this.schema.on('init', this.setIndexAndType.bind(this));
  this.schema.statics.es = this;

  this.collector = null;

  this._setOptions(options);
  this._initElastic();
  this._setMethods();
  this._setMiddleware();
}

MongooseES.prototype._defaults = {
  hydrate: true,
  elastic: {
    host: 'localhost:9200'
  },
  mapping: {},
  settings: {},
  middleware: {
    save: true,
    remove: true
  },
  sync: {
    query: {}
  },
  transform: noop,
  bulk_size: 1000,
  bulk_time: 1000
};

/**
 * Set index and type names
 * @param model
 */
MongooseES.prototype.setIndexAndType = function(model) {
  if (!this.options.index)
    this.options.index = model.collection.name;

  if (!this.options.type)
    this.options.type = model.modelName;

  if (!this._model)
    this._model = model;
};

/**
 * Set options
 *
 * @api private
 * @param options
 */
MongooseES.prototype._setOptions = function(options) {
  this.options = options || {};

  if (_.has(this.options.middleware) && _.isBoolean(this.options.middleware) && this.options.middleware) {
    delete this.options.middleware; // remove for defaults options
  }

  _.defaults(this.options, this._defaults);

  /**
   * fix for error in Elastic: "Do not reuse objects to configure the elasticsearch Client"
   */
  this.options = _.cloneDeep(this.options);
};

/**
 * Set middleware
 * @api private
 */
MongooseES.prototype._setMiddleware = function() {
  if (this.options.middleware) {
    if (this.options.middleware.save) {
      this.schema.post('save', function(doc) {
        doc.index();
      });
    }

    if (this.options.middleware.remove) {
      this.schema.post('remove', function(doc) {
        doc.unIndex();
      });
    }
  }
};

/**
 * Init elastic client
 * @api private
 */
MongooseES.prototype._initElastic = function() {
  this.client = new Elastic.Client(this.options.elastic);
};

/**
 * Set Methods
 *
 * Methods will be to each document
 *
 * @api private
 */
MongooseES.prototype._setMethods = function() {
  var self = this
    , schema = this.schema;

  // proxy
  schema.methods.index = function() {
    return self.index(this);
  };
  schema.methods.unIndex = function() {
    return self.unIndex(this);
  };
};

/**
 * Push to Bulk Collector
 *
 * @private
 */
MongooseES.prototype._pushToCollector = function(action) {
  if (!this.collector)
    this.collector = new Collector(this, this.options.bulk_size, this.options.bulk_time);

  if (this.collector.isFull()) {
    this.collector.boil();
    this.collector = new Collector(this, this.options.bulk_size, this.options.bulk_time);
  }

  return this.collector.push(action);
};

/**
 * Create or update mapping
 */
MongooseES.prototype.putMapping = function(mapping) {
  var self = this
    , indexName = this.options.index
    , typeName = this.options.type
    , client = this.client
    , body = {};

  body[this.options.type] = mapping || this.options.mapping;

  return client
    .indices.exists({
      index: indexName
    })
    .then(function(exists) {
      if (exists) {
        return client.putMapping({
          index: indexName,
          type: typeName,
          body: body
        });
      } else {
        return self.createIndex();
      }
    });
};

/**
 * Create index with mapping
 */
MongooseES.prototype.createIndex = function() {
  var mapping = {};

  mapping[this.options.type] = this.options.mapping;

  return this.client.indices.create({
    index: this.options.index,
    body: {
      settings: this.options.settings,
      mappings: mapping
    }
  });
};

/**
 * Indices refresh
 *
 * @param options
 */
MongooseES.prototype.refresh = function(options) {
  options = options || {};

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;

  return this.client.indices.refresh(options);
};

/**
 * Count doc in index
 *
 * @param options
 */
MongooseES.prototype.count = function(options) {
  options = options || {};

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;

  return this.client.count(options);
};

/**
 * Bulk
 *
 * @param body
 * @param options
 */
MongooseES.prototype.bulk = function(body, options) {
  options = options || {};

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;
  options.body = body;

  return this.client.bulk(options);
};

/**
 * Sync data
 *
 * @param options
 * @returns {events.EventEmitter}
 */
MongooseES.prototype.sync = function(options) {
  options = options || {};

  var self = this
    , model = self._model
    , defer = Promise.defer()
    , query = options.query || this.options.sync.query
    , query_options = options.options
    , stream
    , collector = new Collector(this);

  stream = model.find(query, null, query_options).stream();

  stream.on('data', function(doc) {
    var selfStream = this;

    Promise
      .resolve()
      .then(function() {
        return self.options.transform(doc);
      })
      .then(function(returned) {
        collector.push([{index: { _id: doc._id.toString() }}, returned]);

        if (collector.isFull() || collector.isBoiling) {
          selfStream.pause();

          collector
            .boil()
            .then(function() {
              collector = new Collector(self);
              selfStream.resume();
            })
            .catch(function(reason) {
              defer.reject(reason);
            });
        }
      });
  });

  stream.on('close', function() {
    if (collector.isEmpty()) return defer.resolve();

    collector
      .boil()
      .then(function() {
        defer.resolve();
      })
      .catch(function(reason) {
        defer.reject(reason);
      });
  });

  stream.on('error', defer.reject.bind(defer));

  return defer.promise;
};

/**
 * Document index
 *
 * @param doc Mongoose document
 */
MongooseES.prototype.index = function(doc) {
  var self = this;

  return Promise.resolve()
    .then(this.options.transform.bind(this, doc))
    .then(function(body) {
      return self.client.index({
        index: self.options.index,
        type: self.options.type,
        id: doc._id.toString(),
        body: body
      });
    })
    .then(function(res) {
      doc.emit('es-index', res);
      return res;
    });
};

/**
 * Un Index document
 *
 * @param doc Mongoose document
 */
MongooseES.prototype.unIndex = function(doc) {
  return this.client
    .delete({
      index: this.options.index,
      type: this.options.type,
      id: doc._id.toString()
    })
    .then(function(res) {
      doc.emit('es-unIndex', res);
    });
};

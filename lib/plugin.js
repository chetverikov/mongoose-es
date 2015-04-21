'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var Elastic = require('elasticsearch')
  , events = require('events')
  , _ = require('lodash')
  , noop = function(doc, done) {
    if (_.isFunction(done)) {
      return done(null, doc);
    }
    return doc;
  };

module.exports = MongooseES;

function MongooseES(schema, options) {
  this.schema = schema;

  this.schema.on('init', this.setIndexAndType.bind(this));
  this.schema.statics.es = this;

  this.$_setOptions(options);
  this.$_initElastic();
  this.$_setMethods();
  this.$_setMiddleware();
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
  bulk_size: 1000
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
MongooseES.prototype.$_setOptions = function(options) {
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
MongooseES.prototype.$_setMiddleware = function() {
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
MongooseES.prototype.$_initElastic = function() {
  this.client = new Elastic.Client(this.options.elastic);
};

/**
 * Set Methods
 *
 * Methods will be to each document
 *
 * @api private
 */
MongooseES.prototype.$_setMethods = function() {
  var self = this
    , schema = this.schema;

  // proxy
  schema.methods.index = function(done) {
    self.index(this, done);
  };
  schema.methods.unIndex = function(done) {
    self.unIndex(this, done);
  };
};

/**
 * Create or update mapping
 */
MongooseES.prototype.putMapping = function(mapping, done) {
  done = done || noop;

  var self = this
    , indexName = this.options.index
    , typeName = this.options.type
    , client = this.client
    , body = {};

  body[this.options.type] = mapping || this.options.mapping;

  client.indices.exists({
    index: indexName
  }, function(err, exists) {
    if (err) return done(err);

    if (exists) {
      client.putMapping({
        index: indexName,
        type: typeName,
        body: body
      }, done);
    } else {
      self.createIndex(done);
    }
  });
};

/**
 * Create index with mapping
 * @param done
 */
MongooseES.prototype.createIndex = function(done) {
  var mapping = {};

  mapping[this.options.type] = this.options.mapping;

  this.client.indices.create({
    index: this.options.index,
    body: {
      settings: this.options.settings,
      mappings: mapping
    }
  }, done);
};

/**
 * Indices refresh
 *
 * @param options
 * @param done
 */
MongooseES.prototype.refresh = function(options, done) {
  if (!done) {
    done = options;
    options = {};
  }

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;

  this.client.indices.refresh(options, done);
};

/**
 * Count doc in index
 *
 * @param options
 * @param done
 */
MongooseES.prototype.count = function(options, done) {
  if (!done) {
    done = options;
    options = {};
  }

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;

  this.client.count(options, done);
};

/**
 * Bulk
 *
 * @param body
 * @param options
 * @param done
 */
MongooseES.prototype.bulk = function(body, options, done) {
  if (!done) {
    done = options;
    options = {};
  }

  options.index = options.index || this.options.index;
  options.type = options.type || this.options.type;
  options.body = body;

  this.client.bulk(options, done);
};

/**
 * Sync data
 * TODO: Разобраться с timeout`ом после bulk`а
 * @param options
 * @param done
 * @returns {events.EventEmitter}
 */
MongooseES.prototype.sync = function(options, done) {
  if (_.isFunction(options)) {
    done = options;
    options = {};
  }

  if (!done) done = noop;

  var self = this
    , model = self._model
    , em = new events.EventEmitter()
    , query = options.query || this.options.sync.query
    , query_options = options.options
    , stream
    , commandSequence = [];

  stream = model.find(query, query_options).stream();

  stream.on('data', function(doc) {
    var selfStream = this;

    commandSequence.push({index: { _id: doc._id.toString() }});
    self.options.transform(doc, function(err, returned) {
      commandSequence.push(returned);

      if (commandSequence.length >= self.options.bulk_size) {
        selfStream.pause();

        self.bulk(commandSequence, function(err) {
          commandSequence = [];

          if (err) return done(err);

          selfStream.resume();
        });
      }
    });
  });

  stream.on('close', function() {
    if (!commandSequence.length) return done();

    self.bulk(commandSequence, function(err) {
      commandSequence = [];

      done(err);
    });
  });

  stream.on('error', done);

  return em;
};

/**
 * Document index
 *
 * TODO: 1) proxy options
 * TODO: 2) async transform
 *
 * @param doc Mongoose document
 * @param done Callback
 */
MongooseES.prototype.index = function(doc, done) {
  if (!done) done = noop;

  this.options.transform(doc, function(err, body) {
    this.client.index({
      index: this.options.index,
      type: this.options.type,
      id: doc._id.toString(),
      body: body
    }, function(err, res) {
      doc.emit('es-index', err, res);
      done(err, res);
    });
  }.bind(this));
};

/**
 * Un Index document
 *
 * TODO: force refresh index before delete !?
 *
 * @param doc Mongoose document
 * @param done Callback
 */
MongooseES.prototype.unIndex = function(doc, done) {
  if (!done) done = noop;

  this.client.delete({
    index: this.options.index,
    type: this.options.type,
    id: doc._id.toString()
  }, function(err, res) {
    doc.emit('es-unIndex', err, res);
    done(err, res);
  });
};
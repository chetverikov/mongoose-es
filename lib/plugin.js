'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const Elastic = require('elasticsearch');
const Collector = require('./collector');
const events = require('events');
const cloneDeep = require('lodash.clonedeep');
const clone = require('lodash.clone');
const has = require('lodash.has');
const defaults = require('lodash.defaults');
const isBoolean = require('lodash.isboolean');

/**
 * Noop func
 *
 * @param doc
 * @returns {Array|Object|Binary|*}
 */
function noop(doc) {
  var data = doc.toObject();
  delete data._id;
  return data;
}

class MongooseES {
  constructor(schema, options) {
    this.schema = schema;

    this.schema.on('init', this.setIndexAndType.bind(this));
    this.schema.statics.es = this;

    this.collector = null;

    this._defaults = {
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

    this._setOptions(options);
    this._initElastic();
    this._setMethods();
    this._setMiddleware();
  }

  /**
   * Set index and type names
   * @param model
   */
  setIndexAndType(model) {
    if (!this.options.index) {
      this.options.index = model.collection.name;
    }

    if (!this.options.type) {
      this.options.type = model.modelName;
    }

    if (!this._model) {
      this._model = model;
    }
  }

  /**
   * Set options
   *
   * @api private
   * @param options
   */
  _setOptions(options) {
    this.options = options || {};

    if (has(this.options.middleware) && isBoolean(this.options.middleware) && this.options.middleware) {
      delete this.options.middleware; // remove for defaults options
    }

    defaults(this.options, this._defaults);

    /**
     * fix for error in Elastic: "Do not reuse objects to configure the elasticsearch Client"
     */
    this.options = cloneDeep(this.options);
  }

  /**
   * Set middleware
   * @api private
   */
  _setMiddleware() {
    if (this.options.middleware) {
      if (this.options.middleware.save) {
        this.schema.post('save', doc => doc.index());
      }

      if (this.options.middleware.remove) {
        this.schema.post('remove', doc => doc.unIndex());
      }
    }
  }

  /**
   * Init elastic client
   * @api private
   */
  _initElastic() {
    this.client = new Elastic.Client(this.options.elastic);
  }

  /**
   * Set Methods
   *
   * Methods will be to each document
   *
   * @api private
   */
  _setMethods() {
    const mongoose_es = this;

    // proxy
    this.schema.methods.index = function() {
      return mongoose_es.index(this);
    };
    this.schema.methods.unIndex = function() {
      return mongoose_es.unIndex(this);
    };
  }

  /**
   * Push to Bulk Collector
   *
   * @private
   */
  _pushToCollector(action) {
    if (!this.collector) {
      this.collector = new Collector(this, this.options.bulk_size, this.options.bulk_time);
    }

    if (this.collector.isFull()) {
      this.collector.boil();
      this.collector = new Collector(this, this.options.bulk_size, this.options.bulk_time);
    }

    return this.collector.push(action);
  }

  /**
   * Create or update mapping
   */
  putMapping(mapping) {
    const index = this.options.index;
    const type = this.options.type;
    const client = this.client;
    const body = {};

    body[this.options.type] = mapping || this.options.mapping;

    return client
      .indices.exists({
        index
      })
      .then(exists => {
        if (exists) {
          return client.putMapping({
            index,
            type,
            body
          });
        }

        return this.createIndex();
      });
  }

  /**
   * Create index with mapping
   */
  createIndex() {
    var mapping = {};

    mapping[this.options.type] = this.options.mapping;

    return this.client.indices.create({
      index: this.options.index,
      body: {
        settings: this.options.settings,
        mappings: mapping
      }
    });
  }

  /**
   * Indices refresh
   *
   * @param options
   */
  refresh(options) {
    options = options || {};

    options.index = options.index || this.options.index;
    options.type = options.type || this.options.type;

    return this.client.indices.refresh(options);
  }

  /**
   * Count doc in index
   *
   * @param options
   */
  count(options) {
    options = options || {};

    options.index = options.index || this.options.index;
    options.type = options.type || this.options.type;

    return this.client.count(options);
  }

  /**
   * Bulk
   *
   * @param body
   * @param options
   */
  bulk(body, options) {
    options = options || {};

    options.index = options.index || this.options.index;
    options.type = options.type || this.options.type;
    options.body = body;

    return this.client.bulk(options);
  }

  /**
   * Sync data
   *
   * @param options
   * @returns {events.EventEmitter}
   */
  sync(options) {
    options = options || {};

    const model = this._model;
    const defer = Promise.defer();
    const query = options.query || this.options.sync.query;
    const query_options = options.options;
    const collector = new Collector(this);
    let count = 0;

    /**
     * finish add doc to collector
     * @returns {*}
     */
    const finish = () => {
      if (collector.isEmpty()) {
        return defer.resolve();
      }

      return collector
        .executed()
        .then(bulks => defer.resolve(bulks))
        .catch(reason => defer.reject(reason));
    };

    /**
     * on data handler
     * @param doc
     * @param total
     */
    const on_data = (doc, total) => {
      Promise
        .resolve(this.options.transform(doc))
        .then(transformed => {

          transformed = cloneDeep(transformed);
          transformed._id = undefined;

          collector.push([
            {
              index: {
                _id: doc._id.toString(),
                _index: this.options.index,
                _type: this.options.type
              }
            },
            transformed
          ]);
          count++;

          if (count >= total) {
            finish();
          }
        })
        .catch(reason => defer.reject(reason));
    };

    model
      .count(query)
      .then(total => {
        const stream = model.find(query, null, query_options).stream();

        stream.on('data', doc => on_data(doc, total));
        stream.on('error', err => defer.reject(err));
      })
      .catch(err => defer.reject(err));

    return defer.promise;
  }

  /**
   * Document index
   *
   * @param doc Mongoose document
   */
  index(doc) {
    return Promise.resolve(doc)
      .then(doc => this.options.transform(doc))
      .then(body => this.client.index({
        index: this.options.index,
        type: this.options.type,
        id: doc._id.toString(),
        body
      }))
      .then(res => {
        doc.emit('es-index', res);
        return res;
      });
  }

  /**
   * Un Index document
   *
   * @param doc Mongoose document
   */
  unIndex(doc) {
    return this.client
      .delete({
        index: this.options.index,
        type: this.options.type,
        id: doc._id.toString()
      })
      .then(res => doc.emit('es-unIndex', res));
  }

}

module.exports = MongooseES;

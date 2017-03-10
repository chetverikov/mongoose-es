'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const Elastic = require('elasticsearch');
const Collector = require('./collector');
const events = require('events');
const cloneDeep = require('lodash.clonedeep');
const defaults = require('lodash.defaults');

/**
 * Noop func
 *
 * @param doc
 * @returns {Array|Object|Binary|*}
 */
function noop(doc) {
  const data = doc.toObject();
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

    if (this.options.middleware === true) {
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
    const mapping = {};

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
   * @return {Promise}
   */
  sync(options) {
    options = options || {};

    const query = options.query || this.options.sync.query;
    const query_options = options.options;
    const collector = new Collector(this);

    return this._model.find(query, null, query_options)
      .cursor()
      .eachAsync(doc => {
        return Promise.resolve()
          .then(() => this.options.transform(doc))
          .then(transformed => {
            if (transformed['_id'] !== null && transformed['_id'] !== undefined) {
              throw new TypeError('Field [_id] is a metadata field and cannot be added inside a document.');
            }

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
          })
      })
      .then(() => {
        if (!collector.isEmpty()) {
          return collector.executed();
        }
      });
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

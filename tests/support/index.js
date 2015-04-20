'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var mongoose = require('mongoose')
  , elastic = require('elasticsearch')
  , _ = require('lodash')
  , default_schema = require('./schema')
  , config
  , support;

config = {
  mongoose: {
    uri: 'localhost:27017',
    options: {}
  },
  elastic: {
    host: 'localhost:9200',
    log: 'trace'
  }
};

module.exports = support = {
  mongoose_connect: function(options) {
    options = options || {};

    var uri
      , noErrorListener = !!options.noErrorListener
      , conn;

    if (options.uri) {
      uri = options.uri;
      delete options.uri;
    } else {
      uri = config.mongoose.uri;
    }

    delete options.noErrorListener;

    conn = mongoose.createConnection(uri, options);

    if (noErrorListener) return conn;

    conn.on('error', function(err) {
      assert.ok(err);
    });

    return conn;
  },

  elastic_connect: function() {

  },

  getModelForTest: function() {
    var name = 'TestME_' + support.random();

    return mongoose.model(name, default_schema, name);
  },

  random: function() {
    return Math.random().toString().substr(3);
  },

  removeCreatedIndexByModel: function(model, done) {
    model.es.client.indices.delete({
      index: model.collection.name,
      type: model.modelName
    }, done);
  }
};

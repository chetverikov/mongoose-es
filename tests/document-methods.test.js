'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , should = require('should');

describe('Document methods', function() {

  var model;

  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = conn.model(support.random() + '_DocumentMethods', schema);

    return model.es.createIndex();
  });

  after(function() {
    return support
      .removeCreatedIndexByModel(model)
      .then(function() {
        conn.close();
      });
  });

  it('document.index', function() {
    return model
      .create({
        name: 'Foo',
        phones: ['89000980909', '1234322344']
      })
      .then(function(document) {
        return Promise.all([document, document.index()]);
      })
      .then(function(data) {
        var res = data[1]
          , document = data[0];

        should.ok(res.created);
        res._id.should.be.equal(document._id.toString());
      });
  });

  it('document.unindex', function() {
    return model.create({
      name: 'Foo',
      phones: ['89000980909', '1234322344']
    }).then(function(document) {
      var defer = Promise.defer();

      document.on('es-index', function() {
        model.es.refresh().then(function() {
          document.on('es-unIndex', function(res) {
            should.ok(res.found);

            res._index.should.be.equal(model.collection.name);
            res._type.should.be.equal(model.modelName);

            defer.resolve();
          });
          document.unIndex();
        }, function(err) {
          defer.reject(err);
        });
      });
      document.index();

      return defer.promise;
    });
  });
});

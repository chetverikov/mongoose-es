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

  before(function(done) {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = conn.model(support.random() + '_DocumentMethods', schema);

    done();
  });

  after(function(done) {
    support.removeCreatedIndexByModel(model, done);
    conn.close();
  });

  it('document.index', function(done) {
    model.create({
      name: 'Foo',
      phones: ['89000980909', '1234322344']
    }, function(err, document) {
      document.index();
      document.on('es-index', function(err, res) {
        should.ifError(err);

        should.ok(res.created);
        res._id.should.be.equal(document._id.toString());

        done();
      });
    });
  });

  it('document.unindex', function(done) {
    model.create({
      name: 'Foo',
      phones: ['89000980909', '1234322344']
    }, function(err, document) {
      document.index();
      document.on('es-index', function(err) {
        should.ifError(err);

        model.es.refresh(function(err) {
          should.ifError(err);

          document.unIndex();
          document.on('es-unIndex', function(err, res) {
            should.ifError(err);

            should.ok(res.found);
            res._index.should.be.equal(model.collection.name);
            res._type.should.be.equal(model.modelName);

            done();
          });
        });
      });
    });
  });
});

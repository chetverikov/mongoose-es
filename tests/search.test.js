'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , async = require('async')
  , should = require('should');

describe('Search', function() {

  var model;

  before(function(done) {
    var schema = require('./support/schema');

    schema.plugin(plugin);

    model = conn.model(support.random() + '_ModelSearch', schema);

    done();
  });

  before(function(done) {
    async.times(30, function(n, next) {
      model.create({
        name: 'Foo ' + n
      }, function(err, doc) {
        should.ifError(err);
        doc.on('es-index', next);
      });
    }, done);
  });

  after(function(done) {
    support.removeCreatedIndexByModel(model, done);
    conn.close();
  });

  describe('search', function() {
    it('refresh exec', function(done) {
      model.es.refresh(function(err) {
        should.ifError(err);

        done();
      });
    });

    it('check count indexed documents', function(done) {
      model.es.count(function(err, res) {
        should.ifError(err);
        res.count.should.be.equal(30);
        done();
      });
    });
  });
});

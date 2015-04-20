'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , async = require('async')
  , should = require('should');

describe('Sync', function() {

  var model;

  before(function(done) {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = conn.model(support.random() + '_ModelSync', schema);

    done();
  });

  before(function(done) {
    async.times(3000, function(n, next) {
      model.create({
        name: 'Foo ' + n
      }, function(err) {
        should.ifError(err);
        next();
      });
    }, done);
  });

  after(function(done) {
    support.removeCreatedIndexByModel(model, done);
    conn.close();
  });

  it('synchronization', function(done) {
    model.es.sync(function(err) {
      should.ifError(err);

      setTimeout(function() {
        model.es.count(function(err, res, status) {
          should.ifError(err);

          res.count.should.be.equal(3000);

          done();
        });
      }, 1000);
    });
  });
});

'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , _ = require('lodash');

require('should');

describe('Sync', function() {
  var model
    , count = 3000;

  this.timeout(10000);

  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      meddleware: false
    });

    model = conn.model(support.random() + '_DocumentMethods', schema);

    return model.es.createIndex();
  });

  before(function() {
    var docs = [];

    _.times(count, function(n) {
      docs.push(
        model.create({name: 'Foo ' + n})
      );
    });

    return Promise
      .all(docs)
      .then(function() {
        return model.count();
      })
      .then(function(count) {
        if (!count || count !== count)
          throw new Error('Docs not create');
      });
  });

  after(function() {
    return support
      .removeCreatedIndexByModel(model)
      .then(function() {
        conn.close();
      });
  });

  it('synchronization', function() {
    return model.es
      .sync()
      .then(function() {
        return model.es.refresh();
      })
      .then(function() {
        return model.es.count();
      })
      .then(function(res) {
        res.count.should.be.equal(count);
      });
  });
});

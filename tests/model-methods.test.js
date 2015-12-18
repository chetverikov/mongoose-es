'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

var support = require('./support')
  , plugin = require('./../lib')
  , conn = support.mongoose_connect()
  , _ = require('lodash');

require('should');

describe('Model methods', function() {

  var model;

  before(function() {
    var schema = require('./support/schema');

    schema.plugin(plugin);

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

  describe('model.refresh', function() {
    before(function() {
      var docs = [];
      _.times(30, function(n) {
        docs.push(
          model
            .create({name: 'Foo ' + n})
            .then(function(doc) {
              var def = Promise.defer();

              doc.on('es-index', def.resolve.bind(def));

              return def.promise;
            })
        );
      });

      return Promise
        .all(docs);
    });

    it('refresh exec', function() {
      return model.es.refresh();
    });

    it('check count indexed documents', function() {
      return model.es.count().then(function(res) {
        res.count.should.be.equal(30);
      });
    });
  });
});
